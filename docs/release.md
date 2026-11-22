# Release & Deployment

Release and deployment procedure for the AoiTube (AoiAsakawa/aoi-tube) fork. For build
tooling, tests, and day-to-day development commands see
[development.md](development.md).

## 1. Version bump

- Update `StaticVersionNumber` in `config/constants.go` — this is the version
  reported by `/api/status` (`versionNumber`) and shown in the admin UI.
- Keep `web/package.json` `"version"` and the version numbers mentioned in
  `CLAUDE.md` / `README.md` in sync.

## 2. Build

```bash
# Frontend bundle: vite build → static/web (picked up by //go:embed)
./build/web/bundleWeb.sh

# Backend binary (embeds static/web)
go build -o aoitube main.go
```

The web bundle **must** be rebuilt before the Go build whenever anything under
`web/` changed — the binary serves the embedded copy, not the source tree.

Container/other builds (optional):

```bash
docker build -t aoitube-fork:latest .
earthly +package-all --version="v0.3.0"        # all architectures
earthly +package --platform="linux/amd64"       # one architecture
```

## 3. Pre-release gates

Run the full gate set described in [development.md](development.md):
`go test ./...`, `go vet ./...`, and in `web/`: `npm test`, `npm run lint`,
`npm run type-check`, `npm run check:i18n`. Then do a manual smoke test of the
key flows (playback, chat, admin login).

## 4. Tag & release

```bash
git tag v0.3.x
git push origin v0.3.x
```

Write release notes summarizing user-visible changes.

## 5. Deploying to a server (binary swap)

The deployment model is a single self-contained binary: build it (on the
server or elsewhere for the same OS/arch), back up the running binary, swap,
restart the service. Use absolute paths throughout — the service's working
directory contains the `data/` directory it must keep.

### With `build/deploy.sh`

`build/deploy.sh` does all of it from the development machine over ssh:

```bash
# .deploy.env in the repository root (git-ignored)
DEPLOY_SSH=deploy@stream.example.com
DEPLOY_DIR=/srv/aoitube
DEPLOY_LOCAL_URL=http://127.0.0.1:8080
DEPLOY_PUBLIC_URL=https://stream.example.com
```

```bash
./build/deploy.sh
```

It builds the frontend and the binary, runs the gates from section 3, and
then, on the server:

1. refuses to continue while a broadcast is live (`--force` overrides);
2. uploads the binary as `aoitube.new` and runs `aoitube.new -version` there,
   so a binary the server can't execute is caught before anything changes;
3. backs up the running binary, swaps the new one in and restarts the
   service, putting the previous binary back if the new one doesn't answer
   within 30 seconds;
4. removes old backups (two are kept by default);
5. when `DEPLOY_PUBLIC_URL` is set, fetches the page through it and checks
   that every bundle the page references loads.

`./build/deploy.sh --help` lists the remaining settings and flags.

### By hand

```bash
# On the server, from the checkout (example path: /srv/aoitube)
cd /srv/aoitube
./build/web/bundleWeb.sh
go build -o /srv/aoitube/aoitube.new main.go

# Back up the current binary with a recognizable suffix, then swap
cp /srv/aoitube/aoitube /srv/aoitube/aoitube.bak-$(date +%Y%m%d)
mv /srv/aoitube/aoitube.new /srv/aoitube/aoitube

sudo systemctl restart aoitube
```

Notes:

- A systemd unit example ships in `contrib/aoitube-sample.service`
  (`contrib/aoitube-systemd-service.md`).
- Deploying while a stream is live restarts the stream; the broadcaster's
  encoder (OBS) will reconnect automatically, but prefer deploying while
  offline when possible. The recording survives the restart: on SIGTERM the
  server closes it into an archive, and the next start finishes its MP4 remux
  and S3 offload. The broadcast continues as a new recording once the encoder
  reconnects.
- Roll back by restoring the `.bak-*` binary and restarting.
- `update.sh` in the repository root is the operator's own updater script (it
  is git-ignored); what it does is up to the operator. A checkout kept on a
  server that receives prebuilt binaries only needs `git pull --ff-only`.

### Caches in front of the server

The server sends the HTML shell with `Cache-Control: no-store`, because the
shell names its bundles by content hash and every frontend change produces
new names. A CDN or proxy that is configured to cache HTML anyway keeps
serving the previous shell after a deploy. Two things keep such a page
working:

- `bundleWeb.sh` keeps the bundles of builds from the last 14 days (up to
  20 MB) next to the new ones, so a shell from a recent build still finds its
  files. This only works when consecutive builds happen in the same checkout;
  a fresh clone or CI build has no earlier bundles to keep. Set
  `AOITUBE_KEEP_OLD_ASSETS_DAYS=0` for a clean bundle.
- `asset-recovery.js`, loaded by the shell before the app, reloads the page
  once with a cache-busting query when a bundle fails to load. Like the
  service worker it keeps its name across builds, so the server lets
  browsers cache it for one hour only; the content-hashed bundles under
  `/assets/` are cached for 30 days.

Neither is a reason to cache HTML: configure the CDN to cache `/assets/` and
leave the pages alone.

## 6. Post-deploy verification

`build/deploy.sh` covers 1 and 2. A real browser (3) is still on you.

1. **Version check** — confirm the new binary is live. The binary reports
   its version and build without starting the server:

   ```bash
   /srv/aoitube/aoitube -version
   journalctl -u aoitube -n 50 | grep 'AoiTube v'
   ```

2. **Bundle check** — Vite emits content-hashed assets (e.g.
   `assets/main-DdhrNVfX.js`), so the served HTML reveals exactly which
   bundle the binary embeds. Compare the hashes in the served page against
   the local build:

   ```bash
   curl -s http://localhost:8080/ | grep -o 'assets/[^"]*\.js' | sort -u
   ls static/web/assets/ | grep '^main-'
   ```

   If the hashes differ, the binary was built against an older
   `static/web` — rerun `bundleWeb.sh` and rebuild.

3. **Health** — load the viewer page and the admin (`/admin`) in a real
   browser, watching the console for errors. HTTP 200 alone does not prove
   the SPA executes; JS runtime errors only surface in a browser.

4. After framework-level frontend changes, remind viewers/admins that a hard
   reload may be needed to drop cached bundles.
