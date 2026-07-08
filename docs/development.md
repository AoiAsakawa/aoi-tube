# Development Guide

Developer guide for the AoiTube (AoiAsakawa/aoitube) fork. It covers the tech stack,
repository layout, build/dev commands, UI and admin-form conventions, the i18n
workflow, and hard-won engineering gotchas.

Related docs: [release.md](release.md) (build & deploy),
[database-operations.md](database-operations.md) (SQLite operations),
[backup-and-migration.md](backup-and-migration.md) (backups & node migration),
[SECURITY.md](SECURITY.md) (security posture),
[streaming-and-archives.md](streaming-and-archives.md) (streaming, recording,
PPV), [payments.md](payments.md) (payment providers),
[authentication.md](authentication.md) (auth & account governance), and
[`db/README.md`](../db/README.md) (sqlc queries).

## Tech stack

### Backend

- **Go 1.25** (see `go.mod`) — single binary, HTTP server on `:8080`, RTMP
  ingest on `:1935` (RTMPS optional on `:1936`).
- **SQLite** via `mattn/go-sqlite3`. Type-safe queries are generated with
  **sqlc** from `db/schema.sql` + `db/query.sql` into `db/` (see
  `db/README.md`; sqlc is only needed when changing queries, not to build).
  Columns added after the sqlc bindings were generated (e.g.
  `donations.archive_id`) are handled with raw SQL in `core/data/donations.go`.
- **aws-sdk-go-v2** for S3-compatible object storage — live HLS distribution
  (`core/storageproviders/s3Storage.go`) and archive/backup offload
  (`core/storageproviders/archiveS3.go`, `archives/` and `backups/` prefixes).
  Works with Cloudflare R2 and MinIO (path-style addressing supported).
- **Pion WebRTC v4** — experimental low-latency SFU (`core/webrtc/`).
- **joy5** for RTMP; **FFmpeg** is an external runtime dependency for
  HLS/LL-HLS transcoding, thumbnails, and clip remuxing.
- **CAFxX/httpcompression** for HTTP response compression (pinned to v0.0.8 —
  see [gotchas](#engineering-gotchas)).

### Frontend (`web/`)

- **Vite 8** (rolldown-based) building a **two-entry MPA**: `index.html`
  (viewer) and `admin/index.html` (admin — keeps the Ant Design bundle out of
  the viewer). The Go server (`controllers/web.go`) serves `admin/index.html`
  for `/admin/*` and the viewer shell (with server-side `html/template`
  placeholder injection for OpenGraph/hydration) for everything else.
- **React 19** + **TypeScript 6**.
- **Ant Design 6** (+ `@ant-design/icons`).
- **Zustand 5** for state (`web/components/stores/`); **react-router 7**
  (`react-router-dom`), wrapped by `web/components/compat/` shims left over
  from the Next.js migration so pages don't import the router directly.
- **react-i18next** with five catalogs: `ja`, `en`, `zh`, `zh-TW`, `ko`.
- **video.js 8** for HLS/LL-HLS playback.
- **vitest 4** (+ Testing Library, jsdom) for unit tests.
- **Storybook 10** using the `@storybook/react-vite` framework.

## Repository layout

| Path | Purpose |
|---|---|
| `main.go` | Entry point and CLI flags (`-database`, `-backupdir`, `-restoreDatabase`, `-restoreFromS3`, `-adminpassword`, `-streamkey`, `-webserverport`, `-rtmpport`, …) |
| `config/` | Build-time constants: `StaticVersionNumber`, data/backup directory paths |
| `core/` | Core logic |
| `core/data/` | SQLite-backed datastore: config getters/setters, donations/purchases, per-provider payment settings |
| `core/chat/` | Chat server (WebSocket), event broadcast |
| `core/transcoder/` | FFmpeg HLS and LL-HLS transcoding |
| `core/rtmp/` | RTMP/RTMPS ingest |
| `core/recording/` | Stream recording → VOD archives (manifests, event replay) |
| `core/webrtc/` | WebRTC SFU and media pipeline |
| `core/storageproviders/` | S3 storage for live HLS, archives, backups |
| `controllers/` | HTTP handlers; `controllers/admin/` = admin API, `controllers/auth/` = OAuth flows |
| `router/` | Route registration and middleware (admin auth + rate limiting, security headers) |
| `auth/` | OAuth 2.0 clients (X, Discord, Google, GitHub, IndieAuth, Fediverse) |
| `activitypub/` | Fediverse federation |
| `db/` | sqlc schema, queries, and generated code |
| `models/` | Shared types |
| `integrations/` | External API clients (PayPay) |
| `notifications/` | Discord / browser-push / stream notifications |
| `metrics/` | Prometheus and hardware metrics |
| `geoip/` | GeoIP lookup |
| `yp/` | Owncast directory (YP) integration |
| `utils/` | Helpers: password hashing, DB backup/restore, trusted-proxy client IP |
| `static/` | `go:embed` assets, including the built web bundle at `static/web/` |
| `web/` | Frontend source (see below) |
| `test/` | Test tooling: `test/automated/`, `ocTestStream.sh` synthetic RTMP stream |
| `build/` | Build scripts (`build/web/bundleWeb.sh`) |
| `contrib/` | Operator extras: systemd unit examples, Varnish config |
| `docs/` | Documentation |
| `data/` | Runtime data (SQLite DB, logs, archives, backups) — not in git |

Inside `web/`:

| Path | Purpose |
|---|---|
| `web/index.html`, `web/admin/index.html` | MPA entry shells (viewer shell contains Go-template placeholders) |
| `web/src/` | Vite entries (`mainViewer`, `mainAdmin`) and route tables (`src/routes/`) |
| `web/pages/` | Page components; `pages/admin/` for the admin app |
| `web/components/` | React components: `admin/`, `chat/`, `video/`, `ui/`, `modals/`, `stores/` (Zustand), `compat/` (router/head/dynamic shims) |
| `web/i18n/locales/` | The five translation catalogs |
| `web/styles/` | Global SCSS: `globals.scss` (design tokens), `ant-overrides.scss`, `admin.scss` |
| `web/utils/` | Client utilities and hooks (`use-config-resource.ts`, `server-status-context.tsx`, `apis.ts`) |
| `web/scripts/` | `check-i18n-parity.mjs` |
| `web/stories/` | Storybook stories |

## Build & development commands

### Backend

```bash
# Run locally (verifies go:embed prerequisites, then `go run main.go`)
./start.sh

# Production build
go build -o aoitube main.go

# Tests, vet, lint (lint config is golangci-lint v2 format: .golangci.yml)
go test ./...
go vet ./...
golangci-lint run
```

### Frontend

```bash
# Full production bundle: npm ci + `vite build` → web/out → moved to
# static/web, where //go:embed picks it up. REQUIRED after any web change
# before rebuilding the Go binary.
./build/web/bundleWeb.sh

cd web
npm run dev          # Vite dev server on http://localhost:3000; proxies
                     # /api, /hls, /img, /logo, /thumbnail.jpg,
                     # /customjavascript to http://localhost:8080 — run the
                     # Go server alongside. The admin API allows CORS from
                     # localhost:3000 for exactly this setup.
npm test             # vitest run (npm run test:watch for watch mode)
npm run lint         # eslint (npm run lint:fix to autofix)
npm run type-check   # tsc --noEmit
npm run format       # prettier
npm run check:i18n   # 5-catalog parity gate (see i18n workflow)
npm run storybook    # Storybook dev server on :6006
```

### Database queries

```bash
# Only when changing db/query.sql or db/schema.sql — regenerates db/*.go.
# Not required to build the project. See db/README.md.
sqlc generate
```

CI (`.github/workflows/ci.yml`) runs `go test ./...`, `npm test`, and
`npm run check:i18n`.

## Design & UI conventions

- **Japanese-first.** The UI is designed with Japanese as the primary
  language; `ja` is the source i18n catalog and the pre-render language. All
  user-facing text goes through `t('…')` — never hardcode strings.
- **Dark theme is the default.** Both HTML shells ship
  `data-theme="dark"` so there is no light flash before JS runs. The light
  theme is applied by `:root[data-theme='light']` token overrides in
  `web/styles/globals.scss`.
- **Panel/field tokens** (dark values are the defaults; light overrides them):
  `--color-panel-bg`, `--color-panel-bg-alt`, `--color-panel-bg-deep`,
  `--color-panel-text`, `--color-panel-text-muted`, `--color-panel-border`,
  `--color-panel-border-soft`, `--color-field-bg`, `--color-field-border`,
  `--color-field-placeholder`, plus `--color-panel-bg-translucent` for
  glass surfaces. Use these in component SCSS instead of literal colors so
  both themes work.
- **antd theme switching.** `ConfigProvider` follows the site theme
  (`web/utils/theme-store.ts`): dark → `darkAlgorithm` + site colors, light →
  `defaultAlgorithm`. This styles antd-rendered UI (modals, selects, pickers)
  that SCSS overrides can't reach.
- **Brand purple** `--theme-color-action` doubles as a button background —
  don't repurpose it for body links. Readable link text on panels uses
  `--color-panel-link` (lavender on dark, brand purple on light).
- **Intentionally theme-invariant:** Super Chat tier colors (JPY-based tier
  cards), screen-effect colors, and the brand purple do not change with the
  theme.
- **Radius/shadow scale:** `--radius-sm` (badges/chips), `--radius-md`
  (cards/inputs — aliases the themable `--theme-rounded-corners`),
  `--radius-lg` (hero panels/player), `--radius-pill` (pills), and
  `--shadow-panel` for floating chrome. Use the tokens, not px literals.
- **Use Ant Design components consistently** (forms, modals, tables) rather
  than bespoke widgets.
- Upstream brand reference: [Owncast Brand Guidelines](https://owncast.online/brand/).

## Admin config pages

### Current pattern (use this for new pages)

Admin config pages are built from the shared hook plus shared components, so a
page keeps only its form markup:

- **`useConfigResource<T>(getEndpoint, setEndpoint, initial, options)`**
  (`web/utils/use-config-resource.ts`) — shared GET → form-state → POST
  plumbing. Returns `{ config, setConfig, update, loading, saving, save,
  reload }`; options accept `validate` (return an error string to block
  saving), `successMessage`/`errorMessage`, and `fromResponse` (fill
  defaults). See `web/pages/admin/config-kofi.tsx` for a complete example.
- **Shared components** in `web/components/admin/`:
  - `SettingsCard` — titled card grouping for a settings section
  - `AdminPageHeader` — fixed page heading (pages should have one `h1`)
  - `FormField` — label-above field wrapper
  - `FormFooter` — sticky save bar
  - `PageSkeleton` — loading state
  - `CredentialTabs` — sandbox/production credential pair tabs (payment
    providers keep separate credentials per environment)
  - `EnvironmentModeField` — sandbox/production mode toggle
  - `WebhookUrlField` — copyable webhook URL display
  - `CurrencySelect` — shared currency list (don't duplicate the list)
  - `SetupGuide` — collapsible provider setup steps
  - `TextField`, `ToggleSwitch`, `FormStatusIndicator` — base inputs and
    submit-status display

### Classic upstream flow (still used by `/serverconfig`-backed pages)

Pages that edit fields of the big server config (instance details, video,
storage, …) still use the upstream flow:

- `ServerStatusContext` (`web/utils/server-status-context.tsx`) polls
  `/api/status` and fetches the admin `serverconfig`; forms pre-populate from
  the `serverConfig` context value.
- Each top-level config field has its own POST endpoint. After a successful
  submit, call `setFieldInConfigState()` to update global state.
- `TextFieldWithSubmit` and `ToggleSwitch` (with `useSubmit`) wrap the
  per-field submit UX; `FormStatusIndicator` shows success/warning state —
  see `web/components/admin/ResetYP.tsx` for a `submitStatus` example.

### Admin styling

The admin app does not include antd's dark stylesheet; dark colors come from
the antd `ConfigProvider` algorithm plus `web/styles/ant-overrides.scss`. If
you introduce an antd component that isn't styled yet, add its reset to the
overrides file — and keep selectors for both antd class-name generations (see
gotchas). Admin-wide styles are bundled through `web/styles/admin.scss`.

## i18n workflow

- Catalogs live in `web/i18n/locales/{ja,en,zh,zh-TW,ko}.json` —
  **tab-indented JSON**, nested objects, keys addressed as
  `t('ui.header.home')` / `t('admin.pages…')`.
- **`ja` is the reference catalog.** All five catalogs must expose exactly
  the same key set, and every key referenced from source must resolve —
  enforced by `npm run check:i18n` (`web/scripts/check-i18n-parity.mjs`),
  which also runs in CI. Adding a key means adding it to all five files.
- Fallback chain is `['en', 'ja']`; supported languages are the five above.
- Language detection: `localStorage` (`aoitubeLanguage`) → `navigator`
  language, with Chinese variants mapped to `zh` / `zh-TW`.
- Keep `{{placeholders}}` and `<Trans>` component tags intact when
  translating.

### Improving an existing translation

Edit the relevant `web/i18n/locales/<lang>.json` value(s), keeping the key set,
`{{placeholders}}` and tab indentation unchanged, then run `npm run check:i18n`.
Because the parity gate only checks key sets (not values), retranslating is
safe: it can never break the build. Test with `?lang=<code>` (e.g. `?lang=de`);
untranslated strings look unchanged, but you can confirm existing translations
have not regressed.

### Adding a new language

The five catalogs are not a hard limit — a new language is a self-contained
addition:

1. **Copy the reference catalog**: `cp web/i18n/locales/en.json
   web/i18n/locales/<code>.json` (e.g. `de.json`) and translate the values.
   Keep every key, `{{placeholder}}` and `<Trans>` tag; keep tab indentation
   and a trailing newline (the parity gate is strict about the key set).
2. **Register it** in `web/i18n/index.ts`: import the JSON, add it to
   `SUPPORTED_LANGUAGES` (`{ code: '<code>', label: '<native name>' }`) and to
   the `resources` map. That is the only wiring needed — the language switcher
   reads `SUPPORTED_LANGUAGES`.
3. **Verify**: `npm run check:i18n` (all catalogs must share the same key set),
   then `npx tsc --noEmit` and load the app with `?lang=<code>`.

Because `check:i18n` enforces key parity across every catalog, a partial
translation fails the gate — fill untranslated keys with the English value (or
the reference text) so the set stays complete; those strings simply appear in
English until translated. Community translations are welcome via pull request;
the parity gate keeps them safe to accept.

## Engineering gotchas

Verified-in-code footguns worth knowing before you hit them:

1. **`videojs.Vhs.xhr` is not a plain function** — it carries the
   `onRequest`/`onResponse` hook sets that other code registers on (the
   access-token decorator in `VideoJS.tsx` in particular). Replacing it with a
   bare function detaches those hooks and token-gated streams 404-loop. Wrap
   it, `Object.assign` the original's own properties onto the wrapper, and
   keep `original` falsy (see `web/components/video/metrics/playback.js`).
2. **antd renames Select internals between majors.** v6 renamed
   `.ant-select-selector` → `.ant-select-input` and the selection
   item/placeholder → `.ant-select-content` / `.ant-select-placeholder`;
   overrides that target only one generation silently stop applying. Keep
   both selector generations (see `web/styles/ant-overrides.scss`) and check
   `node_modules` styles when bumping antd.
3. **`CAFxX/httpcompression` must stay pinned at v0.0.8.** v0.0.9 returns
   gzip bodies even without `Accept-Encoding` and drops `Content-Type` on
   compressed responses; combined with `X-Content-Type-Options: nosniff`,
   every page renders as plain text. Builds and tests stay green — verify
   response headers over real HTTP after touching this dependency.
4. **`-start_number` keeps HLS media sequences monotonic across restarts.**
   `NewTranscoder()` seeds ffmpeg's `-start_number` with the unix epoch
   (`core/transcoder/transcoder.go`, used by both the HLS and LL-HLS command
   builders) so `EXT-X-MEDIA-SEQUENCE` never moves backwards after a server
   restart. A backwards jump larger than the playlist length crashes
   video.js/VHS on every playlist refresh in viewers' browsers.
5. **`go:embed` needs the `static/` files to exist at build time**
   (`static/static.go` embeds `all:web`, `img/emoji`, and the offline clips).
   A missing file fails the build with `pattern xxx: no matching files
   found`; restore with `git checkout -- static/`. `./start.sh` pre-checks
   the required files, and `./build/web/bundleWeb.sh` regenerates
   `static/web`.
6. **sqlc bindings don't know about newer columns.** Donation queries that
   touch post-generation columns (`archive_id`, `item_type`, …) are raw SQL
   in `core/data/donations.go`; changing those columns means updating that
   file, not just `db/query.sql`.
