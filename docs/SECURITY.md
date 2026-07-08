# Security Policy

AoiTube appreciates efforts to improve the security of the software
and follow the [GitHub coordinated disclosure of security vulnerabilities](https://docs.github.com/en/code-security/security-advisories/about-coordinated-disclosure-of-security-vulnerabilities#about-reporting-and-disclosing-vulnerabilities-in-projects-on-github)
for responsible disclosure and prompt mitigation.

## Supported Versions

The latest version of AoiTube is seen as the supported version. As a small project we are unable to support previous versions and urge users of the software to stay up to date.

## Security Posture (AoiTube (AoiAsakawa/aoitube) fork)

The measures below are implemented in this fork and verified in code.

### Authentication & passwords

- **bcrypt hashing** for the admin password; inputs longer than bcrypt's
  72-byte limit are pre-hashed with SHA-512 so long passphrases still work
  (`utils/hashing.go`).
- **Auth rate limiting**: 5 failed attempts within a 5-minute window trips a
  15-minute per-IP lockout (`router/middleware/auth.go`). The attempt map is
  pruned and capped to prevent memory growth.
- **OAuth 2.0** for viewer login (X with PKCE, Discord, Google, GitHub);
  state/nonce/verifier values come from `crypto/rand`.

### Trusted-proxy client identification

Client-IP headers (`CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`) are
only honored when the direct peer is a **trusted proxy**
(`utils/clientId.go`); otherwise the socket address is used. Loopback/LAN
peers and Cloudflare's published edge ranges are trusted by default; add
proxies with the `OWNCAST_TRUSTED_PROXIES` environment variable
(comma-separated CIDRs, or `all` — which logs a spoofing warning). This
prevents header forgery from defeating per-IP rate limits and bans.

### Playback & archive access gates (enforced server-side, per request)

- **Live playback** (`canViewStream`, applied to every HLS request and to
  WebRTC offers): silent (test) mode restricts playback to
  admins/moderators; the social-auth-required setting restricts it to
  authenticated users.
- **Recorded archives**: three access tiers — `public`, `authenticated`,
  `paid`. Every playlist/segment/event request re-checks the gate
  (`canViewArchive` in `controllers/archives.go`); paid access requires a
  recorded purchase entitlement (`HasPurchasedArchive`, test payments
  excluded). Archive media offloaded to S3 is **proxied through the
  server**, never linked directly, so the gate stays authoritative with a
  private bucket.
- **Path traversal**: the HLS and archive handlers reject `..` and enforce
  path prefixes; file paths are sanitized with `filepath.Base()`.

### Payment security

- **Completion is recorded only from provider-confirmed facts** — a success
  redirect alone never confirms a payment, and amounts are taken from the
  provider (or the blockchain), never from the client.
- **Stripe**: the webhook signing secret is mandatory — unsigned webhooks are
  rejected. Signatures are HMAC-SHA256 with a timestamp tolerance; the
  redirect path independently fetches the Checkout Session and requires
  `payment_status == "paid"`.
- **PayPay**: signed API requests, mandatory webhook signature, plus an API
  re-check of the payment details.
- **PayPal**: webhook bodies are not trusted; the capture is fetched from the
  PayPal API and verified (status `COMPLETED`, matching `custom_id`, amount).
- **Metamask/crypto**: on-chain verification (recipient, success status,
  ERC-20 transfer logs; Bitcoin via UTXO check) — fail-closed, with amounts
  read from the chain.
- **Ko-fi**: verification token required and compared in constant time
  (`crypto/subtle`); transaction IDs are deduplicated.
- **Single consumption**: pending payments are claimed exactly once
  (`ClaimPendingDonation`), so a webhook and a redirect can't double-confirm;
  `DonationExistsForPayment` deduplicates replays.
- **Limits**: amounts capped at 1,000,000 (major units), messages at 500
  characters, display names at 100 characters. Sandbox/test payments are
  flagged `is_test` and excluded from stats and entitlements.

### Secret handling

Admin GET APIs mask stored secrets (OAuth client secrets, API secrets,
webhook secrets, verification tokens) as `********`; submitting the masked
value back preserves the stored secret (`controllers/admin/serverConfig.go`
and the payment config handlers).

### Input validation & headers

- Chat messages are HTML-sanitized server-side (bluemonday).
- JSON config bodies are capped at 15 MB; upload endpoints use
  `http.MaxBytesReader` with per-type limits.
- Responses carry `Content-Security-Policy`,
  `X-Frame-Options: SAMEORIGIN`, and `X-Content-Type-Options: nosniff`
  (`router/middleware/headers.go`).

### WebSocket

Browser connections must present an `Origin` matching the request host or the
configured server URL; requests without an Origin header (desktop
integrations, OBS browser sources, bots) are allowed. Additional origins can
be allowed via `OWNCAST_ALLOWED_WS_ORIGINS` (comma-separated hostnames, or
`*`).

## Reporting a Vulnerability

To report a security issue with this fork, [open an issue](https://github.com/AoiAsakawa/aoitube/issues/new) on the GitHub repository and *do not* mention vulnerability details in the issue.

For the original Owncast project, please report to the [upstream repository](https://github.com/owncast/owncast).
