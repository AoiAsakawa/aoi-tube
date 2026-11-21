#!/usr/bin/env bash
#
# Builds AoiTube and deploys the binary to a server over ssh.
#
# The server runs one self-contained binary under systemd. This script builds
# it locally, uploads it next to the running one, checks that it starts on the
# server, swaps it in, restarts the service and verifies the result. If the new
# binary doesn't come up, the previous one is put back. docs/release.md
# describes the same steps by hand.
#
# Settings come from the environment, or from a .deploy.env file in the
# repository root (git-ignored, sourced as shell). Required:
#
#   DEPLOY_SSH           ssh destination, e.g. deploy@stream.example.com
#   DEPLOY_DIR           directory on the server that holds the binary and data/
#
# Optional:
#
#   DEPLOY_SSH_PORT      ssh port (default 22)
#   DEPLOY_SERVICE       systemd unit to restart (default aoitube)
#   DEPLOY_BINARY        binary file name inside DEPLOY_DIR (default aoitube)
#   DEPLOY_SUDO          command used to run systemctl (default sudo; set it
#                        to an empty string when connecting as root)
#   DEPLOY_LOCAL_URL     AoiTube's address as seen from the server itself
#                        (default http://127.0.0.1:8080)
#   DEPLOY_PUBLIC_URL    public address; when set, the page and every bundle it
#                        references are fetched through it after the deploy
#   DEPLOY_KEEP_BACKUPS  previous binaries to keep on the server (default 2)
#   DEPLOY_SYNC_SOURCE   set to 1 to fast-forward a git checkout in DEPLOY_DIR
#
# Flags:
#
#   --skip-checks        don't run the test and lint gates
#   --skip-web           reuse static/web instead of rebuilding the frontend
#   --force              deploy even while a broadcast is live
#   -h, --help           show this text

set -o errexit
set -o nounset
set -o pipefail

usage() {
	sed -n '2,/^$/s/^# \{0,1\}//p' "$0"
}

die() {
	echo "deploy: $*" >&2
	exit 1
}

step() {
	printf '\n==> %s\n' "$*"
}

skip_checks=0
skip_web=0
force=0
for arg in "$@"; do
	case "$arg" in
		--skip-checks) skip_checks=1 ;;
		--skip-web) skip_web=1 ;;
		--force) force=1 ;;
		-h | --help)
			usage
			exit 0
			;;
		*) die "unknown argument: $arg (see --help)" ;;
	esac
done

cd "$(git rev-parse --show-toplevel)"

if [ -f .deploy.env ]; then
	set -o allexport
	# shellcheck disable=SC1091
	. ./.deploy.env
	set +o allexport
fi

: "${DEPLOY_SSH:?set DEPLOY_SSH (see --help)}"
: "${DEPLOY_DIR:?set DEPLOY_DIR (see --help)}"
DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"
DEPLOY_SERVICE="${DEPLOY_SERVICE:-aoitube}"
DEPLOY_BINARY="${DEPLOY_BINARY:-aoitube}"
DEPLOY_SUDO="${DEPLOY_SUDO-sudo}"
DEPLOY_LOCAL_URL="${DEPLOY_LOCAL_URL:-http://127.0.0.1:8080}"
DEPLOY_PUBLIC_URL="${DEPLOY_PUBLIC_URL:-}"
DEPLOY_KEEP_BACKUPS="${DEPLOY_KEEP_BACKUPS:-2}"
DEPLOY_SYNC_SOURCE="${DEPLOY_SYNC_SOURCE:-0}"

ssh_opts=(-p "$DEPLOY_SSH_PORT" -o BatchMode=yes)

# remote_bash <args...> runs the script on stdin on the server, with the
# arguments as its positional parameters.
remote_bash() {
	local quoted="" arg
	for arg in "$@"; do
		quoted+=" $(printf '%q' "$arg")"
	done
	ssh "${ssh_opts[@]}" "$DEPLOY_SSH" "bash -s --$quoted"
}

workdir="$(mktemp -d -t aoitube-deploy.XXXXXX)"
trap 'rm -rf "$workdir"' EXIT

# ---------------------------------------------------------------- build ---

if [ "$skip_web" = 1 ]; then
	[ -f static/web/index.html ] || die "static/web is missing; run without --skip-web"
else
	step "Building the frontend"
	./build/web/bundleWeb.sh
fi

if [ "$skip_checks" = 0 ]; then
	step "Running checks"
	(cd web && npx tsc --noEmit && npx eslint . && npx vitest run && npm run check:i18n)
	go build ./...
	go vet ./...
	go test ./...
fi

step "Building the binary"
commit="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain)" ]; then
	commit="${commit}-dirty"
	echo "The working tree has uncommitted changes; the build is marked ${commit}."
fi
build_id="${commit}-$(date +%Y%m%d)"
CGO_ENABLED=1 go build \
	-ldflags "-s -w -X github.com/aoiasakawa/aoitube/config.GitCommit=${build_id}" \
	-o "$workdir/aoitube" main.go
echo "Built ${build_id} ($(du -h "$workdir/aoitube" | cut -f1))."

# --------------------------------------------------------------- server ---

step "Checking the server"
# A transcoder running out of the deploy directory means a broadcast is live.
# The public status can't be trusted for this: silent mode reports offline.
if remote_bash "$DEPLOY_DIR" <<'EOS'; then
dir="$(cd "$1" && pwd -P)" || exit 2
for pid in $(pgrep -x ffmpeg); do
	[ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$dir" ] && exit 0
done
exit 1
EOS
	if [ "$force" = 1 ]; then
		echo "A broadcast is live; continuing because of --force."
	else
		die "a broadcast is live. Wait for it to end, or pass --force (viewers are interrupted while the service restarts; the recording is kept)."
	fi
else
	echo "No broadcast is live."
fi

step "Uploading"
scp -q -P "$DEPLOY_SSH_PORT" -o BatchMode=yes "$workdir/aoitube" "$DEPLOY_SSH:$DEPLOY_DIR/$DEPLOY_BINARY.new"

# Run it where it will live before trusting it with the service: this catches a
# truncated upload and a binary the server can't execute (wrong arch, older
# libc) while the old one is still running.
reported="$(
	remote_bash "$DEPLOY_DIR" "$DEPLOY_BINARY" <<'EOS'
cd "$1" && chmod 755 "$2.new" && "./$2.new" -version
EOS
)" || die "the uploaded binary does not run on the server"
case "$reported" in
	*"(${build_id})"*) echo "The server runs it as: ${reported}" ;;
	*) die "the uploaded binary reports '${reported}', expected build ${build_id}" ;;
esac

step "Swapping the binary and restarting ${DEPLOY_SERVICE}"
backup="${DEPLOY_BINARY}.bak-predeploy-$(date +%Y%m%d-%H%M%S)"
if ! remote_bash "$DEPLOY_DIR" "$DEPLOY_BINARY" "$backup" "$DEPLOY_SERVICE" "$DEPLOY_SUDO" "$DEPLOY_LOCAL_URL" <<'EOS'; then
set -u
dir=$1 binary=$2 backup=$3 service=$4 sudo=$5 url=$6
cd "$dir" || exit 1

had_previous=0
if [ -f "$binary" ]; then
	cp -p "$binary" "$backup" || exit 1
	had_previous=1
fi
mv "$binary.new" "$binary" || exit 1
$sudo systemctl restart "$service" || echo "systemctl restart failed"

came_up() {
	for _ in $(seq 1 30); do
		if curl -fsS -m 3 -o /dev/null "$url/api/status" 2>/dev/null; then
			return 0
		fi
		sleep 1
	done
	return 1
}

if came_up; then
	echo "The service answers on $url."
	exit 0
fi

echo "The new binary did not come up within 30 seconds:"
$sudo journalctl -u "$service" -n 15 --no-pager 2>/dev/null | sed 's/^/    /'
if [ "$had_previous" = 1 ]; then
	echo "Putting the previous binary back."
	mv "$binary" "$binary.failed" && cp -p "$backup" "$binary" && $sudo systemctl restart "$service"
	if came_up; then
		echo "The previous binary is running again. The failed one is kept as $binary.failed."
	else
		echo "The previous binary does not answer either. Check the service by hand."
	fi
fi
exit 1
EOS
	die "the deploy failed (see above)"
fi

# ---------------------------------------------------------- after-care ---

step "Pruning old backups"
remote_bash "$DEPLOY_DIR" "$DEPLOY_BINARY" "$backup" "$DEPLOY_KEEP_BACKUPS" <<'EOS'
cd "$1" || exit 0
# The one just made always stays; the rest of the quota goes to the newest.
others=$(($4 - 1))
[ "$others" -ge 0 ] || others=0
# shellcheck disable=SC2012
ls -1t "$2".bak-* 2>/dev/null | grep -vxF "$3" | tail -n "+$((others + 1))" | while IFS= read -r old; do
	rm -f -- "$old" && echo "Removed $old"
done
echo "Backups kept: $(ls -1 "$2".bak-* 2>/dev/null | tr '\n' ' ')"
EOS

if [ "$DEPLOY_SYNC_SOURCE" = 1 ]; then
	step "Updating the source checkout on the server"
	remote_bash "$DEPLOY_DIR" <<'EOS' || echo "Could not fast-forward the checkout (not fatal)."
git -C "$1" pull --ff-only 2>&1 | tail -1
git -C "$1" log -1 --format='Checkout is at %h %s'
EOS
fi

public_ok=1
if [ -n "$DEPLOY_PUBLIC_URL" ]; then
	step "Checking ${DEPLOY_PUBLIC_URL}"
	base="${DEPLOY_PUBLIC_URL%/}"
	page="$workdir/public.html"
	if ! curl -fsS -m 20 -o "$page" "$base/"; then
		echo "Could not fetch the public page."
		public_ok=0
	else
		# The page as served to the public, and every bundle it references.
		missing=0
		total=0
		while IFS= read -r asset; do
			total=$((total + 1))
			code="$(curl -s -m 20 -o /dev/null -w '%{http_code}' "$base$asset" || true)"
			if [ "$code" != 200 ]; then
				echo "  $code $asset"
				missing=$((missing + 1))
			fi
		done < <(grep -oE '(src|href)="/assets/[^"]+"' "$page" | sed -E 's/^[a-z]+="//; s/"$//' | sort -u)

		if [ "$missing" -gt 0 ]; then
			public_ok=0
			cat <<EOF
$missing of the $total bundles the public page references are missing.
The page is most likely an older copy held by a CDN or proxy in front of the
server, from a build whose bundles are no longer embedded. Purge that cache.
Until then visitors get a page that reloads itself once (asset-recovery.js)
and may stay blank.
EOF
		else
			echo "The public page loads, with all $total bundles it references."
			served="$(grep -oE 'assets/main-[^"]+\.js' "$page" | head -1 || true)"
			built="$(grep -oE 'assets/main-[^"]+\.js' static/web/index.html | head -1 || true)"
			if [ -n "$served" ] && [ "$served" != "$built" ]; then
				echo "Note: it is an older copy of the page ($served, this build has $built)."
				echo "A cache in front of the server still holds it. It keeps working because"
				echo "recent bundles stay embedded, and it is replaced when that cache expires."
			fi
		fi
	fi
fi

step "Done"
echo "Deployed ${build_id} to ${DEPLOY_SSH}:${DEPLOY_DIR}."
echo "To roll back: restore ${backup} over ${DEPLOY_BINARY} and restart ${DEPLOY_SERVICE}."
if [ "$public_ok" != 1 ]; then
	exit 2
fi
