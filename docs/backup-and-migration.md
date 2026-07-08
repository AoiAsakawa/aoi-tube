# Backup & Node Migration

This fork stores all durable state that isn't a media file in a single SQLite
database at `data/owncast.db`: server configuration, chat users, OAuth links,
donations, and **paid-archive purchase entitlements**. Losing that file means
losing configuration and, more importantly, the record of who paid for what.
Because money is involved, the database is backed up automatically and can be
offloaded to S3.

## What lives where

| State | Location | Portable by |
|---|---|---|
| Config, users, donations, entitlements | `data/owncast.db` (SQLite) | database backup |
| Recorded archives (VOD media) | `data/archives/` **or** S3 (`archives/` prefix) | S3, or copy the directory |
| Live HLS segments | ephemeral (regenerated) | n/a |
| Emoji, logo, offline media | `data/` | copy the directory |

If archives are offloaded to S3 (Server → Storage, "Store recordings on S3")
and backups go to S3, the only thing tied to a specific machine is the running
binary — everything else can be pulled from the bucket.

## Automatic backups

Scheduled backups are on by default. Configure them under
**Admin → Settings → Server → Backup**:

- **Enabled** — run scheduled backups (default on).
- **Interval (hours)** — how often to back up (default 24).
- **Retention** — how many local backup files to keep (default 7; 0 keeps all).
- **Store backups on S3** — also upload each backup to the configured S3
  bucket under the `backups/` prefix (reuses the same S3 credentials as live
  distribution / recordings). Off by default.

Backups are written to `data/backup/owncast-backup-<UTC-timestamp>.bak`
(gzip-compressed SQL dumps; override the directory with the `-backupdir`
flag). The first run also happens ~2 minutes after start-up so a fresh deploy
has a recent copy.

> **Database backups and archive media offload are separate features.** A
> backup contains only the SQLite database — configuration, users, and the
> `donations` rows that are the paid-archive **purchase entitlements** — so
> backups are what protect buyers' access. Recorded VOD media is offloaded to
> the `archives/` prefix by the recording feature (Admin → Video → Recording)
> and is *not* inside the `.bak` files.

### Manual / CLI

```bash
# Restore a specific local backup file, then restart AoiTube.
./aoitube -restoreDatabase data/backup/owncast-backup-20260107-030000.bak
```

## Migrating to another node

Because config, users and entitlements all live in one SQLite file, and
archives can live in S3, migration is: **restore the database on the new node,
point it at the same S3 bucket.**

### Option A — one command (S3 backups enabled)

On the **old** node, enable "Store backups on S3" (and ideally "Store
recordings on S3") so the bucket holds both the latest DB backup and the media.

On the **new** node, provide the S3 credentials via environment variables (the
fresh node has no database yet, so they can't come from it) and run:

```bash
export OWNCAST_S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
export OWNCAST_S3_REGION=auto
export OWNCAST_S3_BUCKET=<bucket>
export OWNCAST_S3_ACCESS_KEY=<key>
export OWNCAST_S3_SECRET=<secret>
export OWNCAST_S3_FORCE_PATH_STYLE=true   # true for most S3-compatible providers (R2, MinIO)
# Optional: OWNCAST_S3_ACL for providers that require an object ACL.

# Pull the newest backup from S3 and restore it, then start normally.
./aoitube -restoreFromS3
./aoitube
```

`OWNCAST_S3_ACCESS_KEY`, `OWNCAST_S3_SECRET` and `OWNCAST_S3_BUCKET` are
required; `-restoreFromS3` exits with an error naming them otherwise. After a
successful restore, restart AoiTube **without** the flag.

The restored database already contains the S3 configuration, so recordings and
future backups continue to use the same bucket with no further setup.

### Option B — copy the files

1. Stop the old node.
2. Copy `data/owncast.db` (and, if archives are on local disk, `data/archives/`)
   to the new node's `data/` directory.
3. Start AoiTube on the new node.

## Recommendations

- **Turn on "Store backups on S3"** if you accept online purchases — a disk
  failure otherwise loses the purchase records (and thus buyers' access).
- Keep the S3 bucket private; archive media is always served **through** the
  AoiTube server (never a public CDN redirect), so the access gate — including
  paid-archive entitlements — stays authoritative regardless of bucket ACL.
- Verify a restore periodically: `-restoreDatabase` into a throwaway path and
  start a test instance.
