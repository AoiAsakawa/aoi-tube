# Release & Deployment

Release and deployment procedure for the AoiTube (AoiAsakawa/aoitube) fork. For build
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
  offline when possible.
- Roll back by restoring the `.bak-*` binary and restarting.
- `update.sh` in the repository root is the operator's own updater script: it
  cleans `static/web/`, pulls the latest commit, and rebuilds the web bundle.
  It does **not** rebuild the Go binary or restart the service — do those
  steps yourself afterwards.

## 6. Post-deploy verification

1. **Version check** — confirm the new binary is live:

   ```bash
   curl -s http://localhost:8080/api/status | grep versionNumber
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
