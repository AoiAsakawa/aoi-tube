# Authentication & Account Governance — Operator Guide

AoiTube lets viewers link social accounts (X, Discord, Google, GitHub, IndieAuth, Fediverse)
to a chat identity, and gives operators tools to manage those identities. The public chat
name stays the auto-generated (random) display name — linking never exposes a viewer's real
social handle to other viewers.

## How identities work

- A viewer is a `users` row with a persistent access token (stored in the browser).
- Linking a social account adds an `auth` row mapping the provider account → that user, so
  re-authenticating from another device recovers the same identity (and its purchases).
- **One active account per provider.** Linking a different account of the same provider
  replaces the previous one; the old link is kept as history, not deleted.

### Lazy registration

Merely visiting the site does **not** create an account. An anonymous user is minted only
on the first real intent — starting a login, or (in open-chat mode) focusing the chat
input. When social auth is required, login is the only entry point, so passive viewers
never accumulate as empty accounts.

## Unlink is a soft delete (reversible)

Unlinking an account **revokes** its `auth` row (sets `revoked_at`) rather than deleting
it. This preserves the provenance of any purchase and makes recovery possible:

- **A user's own unlink is durable.** Re-authenticating with that same account does **not**
  silently restore the old identity — otherwise whoever next controls that social account
  could reclaim it. Only an operator can restore a user-unlinked account (see below).
- **System revocations reactivate.** When switching to a different account of the same
  provider (an "overwrite"), the superseded account can be recovered by re-authenticating
  with it.
- **Purchase protection.** A user who holds purchase history is blocked from unlinking their
  **last** login method, so they can't strand access to what they paid for.

## Handles

At authentication time the account's handle is stored (an X `@name`, GitHub login, Discord
username, Google email, IndieAuth/Fediverse URL). It is shown **only** to the operator (the
admin user list) and to the viewer themselves (the "Your linked accounts" panel in the auth
modal) — never as the public chat name and never to other viewers.

## Audit log

Every auth change is appended to `auth_events` (never edited or deleted): who
(`self`/`admin`), what (`linked` / `unlinked` / `reactivated` / `overwritten` / `merged` /
`deleted`), which provider + handle, and when. This is the authoritative provenance trail
for identity and purchase disputes.

## Admin tools

**Admin > Chat & Users > User data** (`/admin/chat/user-data`), per-user action buttons:

| Action | What it does |
|--------|--------------|
| **Moderator** (shield icon) | Grant/revoke moderator privileges. |
| **History** (clock icon) | Show the full auth audit log for the user. |
| **Merge** (merge icon) | Consolidate this user into another account. |
| **Reactivate** (on a revoked link) | Manually restore an unlinked account — e.g. to give a buyer back access after an accidental unlink. |
| **Delete** (trash icon) | Delete the user (a terminal `deleted` event is recorded first; purchase rows are kept as the financial record). |

The user list also shows each user's active links **and** revoked (unlinked) history, with
handles, so the operator can trace an identity even after it reverts to anonymous.

### Account merge

Merging moves the source user's auth links, purchases, access tokens and chat messages to
the target, keeps one active account per provider on the target, and disables the source
(kept for history). The whole operation runs in a **single transaction** — a partial
failure can never strand purchases under a half-merged account. The audit log is not
rewritten: each user keeps its own history, and a cross-referenced `merged` marker records
the direction. Merging is rejected for disabled targets and API (service) accounts.

## Notes / limitations

- The handle comparison used at confirm time is **not** a security boundary (a social
  account's address/handle is public); true anti-impersonation would need a signature
  challenge from the account's key. The link mapping + operator tools are the governance
  layer.
- Access tokens are long-lived bearer credentials passed in URLs today; header-based
  delivery + rotation/expiry is a recommended future hardening step.
