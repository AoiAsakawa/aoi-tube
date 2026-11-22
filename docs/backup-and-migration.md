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

If archives are offloaded to S3 (Video & Streaming → Recording, "Store
recordings on S3") and backups go to S3, the only thing tied to a specific
machine is the running binary — everything else can be pulled from the bucket.

> **Keep the bucket private.** There is one S3 connection (Server Settings →
> S3 Object Storage), and backups, recordings and, when switched on, live
> distribution all use its bucket. AoiTube reads and writes backups and
> recordings through the S3 API with its keys and needs no public access.
> Never make the bucket publicly readable: no public custom domain, no
> `r2.dev` URL, no public-read ACL or bucket policy.
>
> Backups are encrypted before they are uploaded (see below), so a readable
> bucket does not expose them. Recordings are stored as they are: in a public
> bucket, paid and members-only archives can be downloaded without the access
> check.
>
> Live S3 distribution ("Serve live video from S3") is the exception. It needs
> a publicly readable bucket, and it only works with classic HLS: LL-HLS is
> always served by AoiTube itself. While it is on, AoiTube keeps new
> recordings on local disk, but recordings already in the bucket become public
> along with it. Only use it with a bucket that holds no recordings.
>
> Up to and including 0.3.0-beta.5, the connection could only be saved with
> live distribution switched on, so backing up to S3 meant setting up a public
> bucket, and the backups in it were not encrypted. If you set it up that way,
> remove public access from the bucket and replace the keys and secrets the
> backups contained (see [Replacing the S3 keys](#replacing-the-s3-keys)).

## Automatic backups

Scheduled backups are on by default. Configure them under
**Admin → Settings → Server → Backup**:

- **Enabled** — run scheduled backups (default on).
- **Interval (hours)** — how often to back up (default 24).
- **Retention** — how many backups to keep (default 7; 0 keeps all). It
  applies to the local directory and, separately, to the bucket.
- **Store backups on S3** — also upload each backup, encrypted, to the bucket
  set up under Server Settings → S3 Object Storage, as
  `backups/owncast-backup-<UTC-timestamp>.bak.enc`. Off by default.

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

### Encryption of S3 backups

Backups are encrypted before they leave the server: AES-256-GCM, with a key
derived from the S3 secret key (HKDF-SHA256, a fresh salt and nonce for every
file). There is no separate key to keep: whoever restores from the bucket
needs the S3 credentials anyway, and making the bucket public does not reveal
them. An encrypted file starts with the line `AoiTube encrypted backup v1`.

This has one consequence: a backup can only be decrypted with the S3 secret
key that was configured when it was made. Backups uploaded before encryption
(`.bak`, plain gzip) restore as before, and pruning removes them as new
backups arrive.

### Replacing the S3 keys

1. Create the new key with your storage provider.
2. Enter the new access key and secret key under Server Settings → S3 Object
   Storage and save. The secret key is shown as `********`; leave it as it is
   to keep the stored one.
3. Restart AoiTube (a backup runs two minutes after start) or wait for the next
   scheduled backup, so that the newest backup in the bucket uses the new key.
4. Revoke the old key.

Backups made before the change can still be restored by setting
`OWNCAST_BACKUP_SECRET` to the old secret key (see below). They are deleted
as new backups take their place.

### Manual / CLI

```bash
# Restore a specific local backup file, then restart AoiTube.
./aoitube -restoreDatabase data/backup/owncast-backup-20260107-030000.bak

# An encrypted backup downloaded from the bucket needs the S3 secret key it
# was made with.
OWNCAST_S3_SECRET=<secret> ./aoitube -restoreDatabase owncast-backup-20260107-030000.bak.enc
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

The newest backup is decrypted with `OWNCAST_S3_SECRET`. If it was made with a
different secret key (the keys were replaced and no backup has run since),
the restore stops and says so; set `OWNCAST_BACKUP_SECRET` to the secret key
that was configured when the backup was made and run it again.

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
  paid-archive entitlements — only protects recordings that the bucket does
  not hand out by itself.
- Use one bucket per AoiTube instance. Pruning keeps the newest backups in
  `backups/`, whichever instance wrote them, and `-restoreFromS3` takes the
  newest one.
- Verify a restore periodically: `-restoreDatabase` into a throwaway path and
  start a test instance.
