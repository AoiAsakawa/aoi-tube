# Streaming, Recording & Archives — Operator Guide

This guide covers the streaming protocols, stream recording, VOD archives (including
pay-per-view), retention, S3/R2 offload and the related test/operations features of this
fork.

## Stream protocols

Configured in **Admin > Settings > Streaming Protocol** (`/admin/config-stream-protocol`).

| Protocol | Latency | Notes |
|----------|---------|-------|
| HLS | 10–30 s | Default. Always available. |
| LL-HLS | ~2–5 s | fMP4 (`.m4s`), segment length forced to 1 second. |
| WebRTC | <1 s | Experimental Pion SFU. Off by default. |

The player shows a protocol badge with an expected latency estimate; once enough samples
arrive it switches to the **measured** latency plus the actual resolution/framerate
(e.g. `2.8s · 1080p60`). LL-HLS latency is derived from segment program-date-time against a
skew-corrected clock; WebRTC latency is estimated from `getStats()` round-trip time and
jitter-buffer delay, so it is a lower bound (server-side encode delay is invisible to the
client).

### WebRTC requirements

- **One UDP port must be open to the world.** All WebRTC media is multiplexed onto a
  single fixed UDP port — default `52000`. Set it on the **Stream protocol** settings page
  (Admin → Settings → Stream protocol → *WebRTC UDP port*), or override it with the
  `OWNCAST_WEBRTC_UDP_PORT` environment variable (the env var wins when set). If the port
  is blocked, viewers hang on a "connecting" spinner.

  ```bash
  sudo ufw allow 52000/udp
  ```

  The port binds once at startup, so **a port change takes effect only after a server
  restart** — and remember to open the new port (and close the old one) in the firewall.

- WebRTC media cannot be proxied through Cloudflare; browsers connect directly to the
  server's IP on that port.
- Defaults: Google STUN (`stun:stun.l.google.com:19302`), no TURN, max 50 concurrent
  WebRTC viewers (both configurable on the protocol settings page).
- Viewers opt in via a "low latency mode" toggle on the player. If the WebRTC connection
  fails (e.g. no working ICE path), the player automatically falls back to HLS.
- While WebRTC is enabled, a second FFmpeg re-encode (constrained-baseline H.264 + Opus)
  runs for every broadcast even with zero WebRTC viewers. Disable WebRTC if you don't use
  it regularly.

## Recording

Recording is configured in **Admin > Settings > Video > Recording** and is **off by
default** (it consumes disk).

| Datastore key | Default | Meaning |
|---------------|---------|---------|
| `recording_enabled` | `false` | Record broadcasts as VOD archives. |
| `recording_highest_only` | `true` | Archive only the highest-quality variant instead of every rendition. No admin UI toggle; change via the datastore if you really need all renditions. |
| `recording_retention_count` | `0` (unlimited) | Auto-prune old prunable recordings (see [Retention](#retention)). |
| `recording_store_on_s3` | `false` | Offload finished media to S3/R2 (see [S3/R2 offload](#s3r2-offload)). |

Behavior:

- **All recordings finish hidden.** A finished session never appears on the public
  `/archives` page until you publish it from **Admin > Archives**. This gives you a
  preview-and-price step before anything goes public.
- Recording also runs during [silent test mode](#silent-test-stream-mode), so you can
  test the pipeline without notifying anyone — the result is just another hidden archive.
- Sessions shorter than 5 seconds are discarded automatically.
- Session IDs look like `20260707-185504-2b3uno21`: a timestamp prefix (keeps pruning
  chronological) plus a random suffix so hidden recordings cannot be enumerated by URL
  guessing.
- When the recording finishes, it is losslessly remuxed (`-c copy`) into a single
  progressive `replay.mp4` used for VOD playback. This exists because the fMP4 HLS VOD
  had a constant ~740 ms A/V offset in the old Video.js/VHS engine; the plain `<video>`
  MP4 playback the players use now measures within ~100 ms. If the remux fails, playback
  falls back to the HLS playlist.
- **Under LL-HLS the recording is fed by a disk-mirror ffmpeg output.** gohlslib serves
  the live low-latency stream from RAM and never writes segments to disk, so the recorder
  (and the thumbnail generator) had nothing to mirror. A single `-c copy` HLS output of
  the top rendition (`llhlsFfmpeg.go` `diskMirrorOutput`) runs alongside the LL-HLS
  muxers — regardless of the recording toggle, so thumbnails also work — PUTting segments
  to the internal file-writer service, which writes `data/hls/<top>/` and fires the normal
  `SegmentWritten` hooks. From there recording, retention, `replay.mp4` and S3 offload are
  identical to classic HLS. These mirror segments are **not** pushed to the live storage
  provider under LL-HLS (nothing serves them; the stream is served from RAM).
- A chat/event log (`events.jsonl`) is captured alongside the media so the archive replay
  can re-play chat messages and screen effects in sync with the video (with seeking).

## Archives and access tiers

Manage archives in **Admin > Archives** (`/admin/archives`); viewers browse published ones
at `/archives`.

The admin list supports:

- **Inline title editing** — click the title cell to rename an archive
  (`POST /api/admin/archives/title`).
- **Size column** — total media size per session. Manifests that predate the field are
  backfilled lazily: local sessions are summed on request, S3-offloaded sessions are
  summed in a background listing the first time the admin list is loaded.
- Publish/hide toggle, deletion (bulk-capable) and per-archive access/pricing.

### Access tiers

Each archive has an access mode (`POST /api/admin/archives/pricing`):

| Mode | Who can watch |
|------|---------------|
| `public` | Everyone. |
| `authenticated` | Any logged-in (socially authenticated) viewer. |
| `paid` | Viewers who purchased the archive (pay-per-view), at a price you set per archive. |

Entitlement rules, all enforced server-side on every playlist/segment/event request:

- The **price is read from the archive manifest on the server** — client-supplied amounts
  are ignored, and double purchases are rejected.
- **Admins bypass every gate including visibility** (needed to preview hidden recordings);
  **moderators bypass the authenticated and paid gates**.
- Purchases are recorded in the `donations` table (`item_type='archive'`) and **survive
  archive deletion** — who bought what, when, for how much remains auditable even after
  the media is gone.
- Archive **thumbnails** are the storefront preview: any visible, finished archive serves
  its thumbnail regardless of tier (plain `<img>` tags cannot carry access tokens).
- Payment provider setup and purchase management (manual grants, buyer history) are
  covered in [docs/payments.md](payments.md).

## Retention

`recording_retention_count` keeps at most N *prunable* recordings; older ones are deleted
(local media and any offloaded S3 objects) after each stream ends. `0` disables pruning.

A session is **prunable only if all of these hold**:

- it is hidden (never published), **and**
- its access mode is unrestricted (not `authenticated`, not `paid`), **and**
- it has **never been purchased** (even if its access mode changed later).

Published, members-only, paid and ever-purchased archives are never auto-deleted, and they
**do not count toward the retention slots**. Manifest-less orphan directories are treated
as junk and prunable.

## S3/R2 offload

Set `recording_store_on_s3` (Admin > Settings > Video > Recording) to move finished media
(`.m4s`/`.ts` segments, `init.mp4`, `replay.mp4`) to S3-compatible storage after each
stream. It reuses the S3 credentials from Admin > Server Settings > Storage — they must be
configured first (the API enforces this) — and writes under the `archives/<session-id>/`
prefix of the same bucket. Manifests, playlists, event logs and thumbnails stay local so
listing and access checks remain cheap.

- **Playback is proxied through the server** (never a direct/CDN URL), so the access-tier
  gates above stay authoritative and the bucket can remain private. Range requests are
  passed through to S3 (`206 Partial Content`), so seeking in `replay.mp4` works after
  offload.
- Offload runs in the background after the stream ends; if an upload fails the media
  simply stays local (graceful fallback). Deleting an archive also deletes its S3 prefix.
- **Live-segment purge:** live HLS distribution segments uploaded to S3 (`hls/` prefix)
  are dead weight once a broadcast ends. They are purged automatically one minute after
  the stream stays offline (the delay avoids racing an instant OBS reconnect).

### Storage usage and cleanup APIs

Two admin endpoints help audit a shared bucket (no web UI yet; use `curl`):

```bash
# Per-prefix usage: hls/, archives/, backups/, other + incomplete multipart count
curl -u admin:PASSWORD https://your-domain/api/admin/storage/usage

# Cleanup targets
curl -u admin:PASSWORD -X POST -d '{"target":"livehls"}'         https://your-domain/api/admin/storage/cleanup
curl -u admin:PASSWORD -X POST -d '{"target":"orphan-archives"}' https://your-domain/api/admin/storage/cleanup
curl -u admin:PASSWORD -X POST -d '{"target":"multipart"}'       https://your-domain/api/admin/storage/cleanup
```

| Target | Deletes | Guard |
|--------|---------|-------|
| `livehls` | Everything under `hls/` | Refused while a stream is online. |
| `orphan-archives` | `archives/<id>/` prefixes whose session no longer exists locally (leftovers of interrupted offloads/deletes). | — |
| `multipart` | Aborts all incomplete multipart uploads (billed but invisible to listing). | — |

## Silent (test) stream mode

**Admin > Settings > Notifications > Silent stream mode** (`silent_stream_mode`). While
enabled:

- All go-live notifications are suppressed (webhooks, browser push, Discord, X, Fediverse,
  directory).
- **Unauthenticated viewers and regular users see the server as offline** — the status API
  reports offline and stream content (playback, thumbnails, previews) is denied.
- **Only admins and moderators can watch**: admins authenticate with Basic auth (i.e. via
  the admin panel/domain), moderators with their chat access token. As the streamer, watch
  your own silent stream from a moderator account or through the admin domain — an
  ordinary logged-in account will not see it.

Combined with recording, this is the recommended way to run end-to-end tests: no follower
notifications, and the test recording finishes as a hidden archive you can delete.

## Chat session scoping

Viewer-facing chat history is scoped to the **current stream session**: messages from
before the most recent stream end are excluded from the history a new viewer receives, so
a finished stream's chat does not linger on the site (or on polling comment viewers).
Messages sent while offline (waiting-room chat) are newer than the cutoff and stay
visible.

Two related mechanisms:

- A pruner deletes chat messages older than 2 hours from the database (runs every
  5 minutes) — the session cutoff simply hides the tail earlier than the pruner would.
- The **admin moderation view is not scoped** — it returns everything still in the
  database, so you can moderate across the cutoff.

Note that archives are unaffected: replays use the per-session `events.jsonl`, not the
live chat table.
