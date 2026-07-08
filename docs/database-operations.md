# AoiTube Database Operations Guide

AoiTube uses a SQLite database. The database file is located at `data/owncast.db`.

## Prerequisites

If sqlite3 is not installed:

```bash
# Ubuntu/Debian
sudo apt-get install -y sqlite3

# macOS
brew install sqlite3
```

## Basic Operations

### Connect to the Database

```bash
cd /path/to/aoitube
sqlite3 data/owncast.db
```

### List Tables

```sql
.tables
```

### Inspect Table Structure

```sql
.schema users
.schema auth
.schema user_access_tokens
```

---

## User Management

### List All Users

```bash
sqlite3 data/owncast.db "SELECT id, display_name, authenticated_at, created_at FROM users;"
```

### Search for a Specific User

```bash
sqlite3 data/owncast.db "SELECT * FROM users WHERE display_name LIKE '%name%';"
```

### Check a User's Authentication Status

```bash
sqlite3 data/owncast.db "SELECT u.id, u.display_name, u.authenticated_at, a.type FROM users u LEFT JOIN auth a ON u.id = a.user_id;"
```

### Delete All Users (Reset)

```bash
sqlite3 data/owncast.db "DELETE FROM user_access_tokens; DELETE FROM auth; DELETE FROM users;"
```

### Delete a Specific User

```bash
sqlite3 data/owncast.db "DELETE FROM user_access_tokens WHERE user_id = 'USER_ID'; DELETE FROM auth WHERE user_id = 'USER_ID'; DELETE FROM users WHERE id = 'USER_ID';"
```

### Disable a User (Hide, Not Ban)

```bash
sqlite3 data/owncast.db "UPDATE users SET disabled_at = datetime('now') WHERE id = 'USER_ID';"
```

### Re-enable a User

```bash
sqlite3 data/owncast.db "UPDATE users SET disabled_at = NULL WHERE id = 'USER_ID';"
```

---

## Authentication Management

### View Authentication Records

```bash
sqlite3 data/owncast.db "SELECT * FROM auth;"
```

### List Users by Authentication Type

```bash
# X-authenticated users
sqlite3 data/owncast.db "SELECT u.display_name, a.type FROM users u JOIN auth a ON u.id = a.user_id WHERE a.type = 'x';"

# Discord-authenticated users
sqlite3 data/owncast.db "SELECT u.display_name, a.type FROM users u JOIN auth a ON u.id = a.user_id WHERE a.type = 'discord';"

# Twitter-authenticated users (legacy)
sqlite3 data/owncast.db "SELECT u.display_name, a.type FROM users u JOIN auth a ON u.id = a.user_id WHERE a.type = 'twitter';"
```

### Remove a User's Authentication (to Force Re-authentication)

```bash
sqlite3 data/owncast.db "DELETE FROM auth WHERE user_id = 'USER_ID';"
sqlite3 data/owncast.db "UPDATE users SET authenticated_at = NULL WHERE id = 'USER_ID';"
```

### Remove All Authentication Records (Force Everyone to Re-authenticate)

```bash
sqlite3 data/owncast.db "DELETE FROM auth; UPDATE users SET authenticated_at = NULL;"
```

### Manually Mark a User as Authenticated

```bash
sqlite3 data/owncast.db "UPDATE users SET authenticated_at = datetime('now') WHERE id = 'USER_ID';"
```

---

## Access Token Management

### View Access Tokens

```bash
sqlite3 data/owncast.db "SELECT * FROM user_access_tokens;"
```

### Delete a User's Tokens (Force Logout)

```bash
sqlite3 data/owncast.db "DELETE FROM user_access_tokens WHERE user_id = 'USER_ID';"
```

---

## Settings Management

Server configuration is stored as key/value rows in the `datastore` table
(keys defined mostly in `core/data/config.go` and the per-feature files in
`core/data/`).

### Key naming

- Keys are `snake_case`, usually prefixed by feature: `recording_enabled`,
  `recording_retention_count`, `recording_store_on_s3`,
  `recording_highest_only`, `backup_enabled`, `backup_interval_hours`,
  `backup_retention_count`, `backup_store_on_s3`, `silent_stream_mode`,
  `require_twitter_auth` (legacy name — this is the generic
  "social auth required" gate), `stream_protocol_config`, …
- **Payment providers keep separate credentials per environment** as key
  pairs, with a mode flag choosing the active set:
  - PayPay: `paypay_is_sandbox` +
    `paypay_sandbox_api_key` / `paypay_sandbox_api_secret` /
    `paypay_sandbox_merchant_id` and
    `paypay_production_api_key` / `paypay_production_api_secret` /
    `paypay_production_merchant_id`
    (`paypay_api_key`/`paypay_api_secret`/`paypay_merchant_id` are legacy)
  - PayPal: `paypal_is_sandbox` + `paypal_sandbox_client_id` /
    `paypal_sandbox_client_secret` and `paypal_production_client_id` /
    `paypal_production_client_secret`
  - Stripe: `stripe_is_test_mode` + `stripe_test_publishable_key` /
    `stripe_test_secret_key` / `stripe_test_webhook_secret` and
    `stripe_live_publishable_key` / `stripe_live_secret_key` /
    `stripe_live_webhook_secret`
- OAuth provider settings are JSON blobs: `x_auth_configuration`,
  `discord_auth_configuration`, `google_auth_configuration`,
  `github_auth_configuration`. The legal-notice page is `tokushoho_info`
  (JSON); the FAQ uses `faq_enabled` / `faq_markdown_content`.
- Note: the admin **API** masks secrets as `********` on read — inspecting
  the datastore directly (below) is the way to see stored values.

### View Settings

```bash
sqlite3 data/owncast.db "SELECT * FROM datastore;"
```

### Search for a Specific Setting

```bash
sqlite3 data/owncast.db "SELECT * FROM datastore WHERE key LIKE '%paypay%';"
sqlite3 data/owncast.db "SELECT * FROM datastore WHERE key LIKE '%discord%';"
sqlite3 data/owncast.db "SELECT * FROM datastore WHERE key LIKE '%x_auth%';"
```

### Delete a Setting

```bash
sqlite3 data/owncast.db "DELETE FROM datastore WHERE key = 'KEY_NAME';"
```

---

## Chat Message Management

### View Chat Messages

```bash
sqlite3 data/owncast.db "SELECT * FROM messages ORDER BY timestamp DESC LIMIT 20;"
```

### Delete All Chat Messages

```bash
sqlite3 data/owncast.db "DELETE FROM messages;"
```

### Delete a Specific User's Messages

```bash
sqlite3 data/owncast.db "DELETE FROM messages WHERE user_id = 'USER_ID';"
```

---

## Donations & Purchases

All purchases (Super Chats, screen effects, and paid-archive access) are
recorded in the `donations` table. The table is created and migrated with
backward-compatible `ALTER TABLE`s in `core/data/donations.go` (the fork's
columns postdate the sqlc bindings, so those queries are raw SQL there).

Fork-specific columns:

| Column | Meaning |
|---|---|
| `item_type` | `superchat` (default), `effect`, or `archive` |
| `effect_type` | screen-effect id (e.g. `fireworks`) when `item_type = 'effect'` |
| `is_test` | `TRUE` for sandbox/test-mode payments — excluded from stats and entitlements |
| `amount_jpy` | JPY conversion recorded at confirmation time for crypto payments (0 = no conversion) |
| `archive_id` | recording session id when `item_type = 'archive'` |

### Purchase entitlements

For paid archives the donation row **is** the buyer's viewing entitlement:

- `HasPurchasedArchive(userID, archiveID)` (`core/data/donations.go`) grants
  playback when a non-test row exists with `item_type = 'archive'` for that
  user and archive (index: `idx_donations_archive_entitlement`).
- `ArchiveHasAnyPurchase(archiveID)` protects any archive that has ever been
  purchased from automatic retention pruning.
- Purchase rows (who/when/amount/`payment_id`/`archive_id`) intentionally
  **outlive archive deletion** — they remain the audit record even after the
  media is gone.

Because entitlements live in this table, losing the database loses buyers'
access — see [backup-and-migration.md](backup-and-migration.md).

### View Recent Purchases

```bash
sqlite3 data/owncast.db "SELECT created_at, item_type, amount, currency, payment_provider, user_id, archive_id FROM donations ORDER BY created_at DESC LIMIT 20;"
```

### Who Purchased a Paid Archive

```bash
sqlite3 data/owncast.db "SELECT user_id, amount, currency, payment_provider, payment_id, created_at FROM donations WHERE item_type = 'archive' AND archive_id = 'SESSION_ID' AND (is_test IS NULL OR is_test = FALSE);"
```

### Total Revenue by Item Type (Excluding Test Payments)

```bash
sqlite3 data/owncast.db "SELECT item_type, currency, SUM(amount), COUNT(*) FROM donations WHERE is_test IS NULL OR is_test = FALSE GROUP BY item_type, currency;"
```

---

## Backup and Restore

> The server also takes **automatic scheduled backups** (Admin → Settings →
> Server → Backup), optionally uploaded to S3. For automation details and
> one-command node migration see
> [backup-and-migration.md](backup-and-migration.md). The manual commands
> below remain available.

### Back Up the Database

```bash
cp data/owncast.db data/owncast.db.backup
# or
sqlite3 data/owncast.db ".backup 'data/owncast_backup.db'"
```

### Restore from a Backup

```bash
# Run after stopping the server
cp data/owncast.db.backup data/owncast.db
```

### Back Up with a SQL Dump

```bash
sqlite3 data/owncast.db .dump > backup.sql
```

### Restore from a SQL Dump

```bash
sqlite3 data/owncast_new.db < backup.sql
mv data/owncast_new.db data/owncast.db
```

---

## Troubleshooting

### Database Integrity Check

```bash
sqlite3 data/owncast.db "PRAGMA integrity_check;"
```

### Optimize the Database

```bash
sqlite3 data/owncast.db "VACUUM;"
```

### If the Database Is Locked

Stop the server before operating on it:

```bash
# Stop the server
pkill -f owncast

# Run DB operations
sqlite3 data/owncast.db "..."

# Restart the server
./owncast
```

---

## Notes

1. **Back up before operating** — to avoid losing important data
2. **Operate while the server is stopped** — to prevent locks and data inconsistency
3. **Be careful with DELETE statements** — forgetting the WHERE clause deletes all data
4. **Mind foreign key constraints** — when deleting a user, delete the related tables too

---

## Handy One-Liners

```bash
# Count users
sqlite3 data/owncast.db "SELECT COUNT(*) FROM users;"

# Count authenticated users
sqlite3 data/owncast.db "SELECT COUNT(*) FROM users WHERE authenticated_at IS NOT NULL;"

# List users registered today
sqlite3 data/owncast.db "SELECT * FROM users WHERE date(created_at) = date('now');"

# List moderators
sqlite3 data/owncast.db "SELECT * FROM users WHERE scopes LIKE '%MODERATOR%';"
```
