# Payments & Purchases — Operator Guide

This fork sells **services**, not donations: viewers purchase a Super Chat (a highlighted
message displayed in chat), a screen effect, or pay-per-view access to an archive. The
wording matters for payment-provider terms and Japanese commerce law — the site ships a
**Specified Commercial Transactions Act page** (`/tokushoho`) and an **FAQ** (`/faq`),
both editable in the admin panel (Admin > Super Chat > Tokushoho / FAQ settings).

## What can be purchased

| Item type | Description | Price |
|-----------|-------------|-------|
| `superchat` | Highlighted chat message with YouTube-style amount tier colors | Buyer-chosen (up to 1,000,000 major units per provider) |
| `effect` | One of 8 on-screen effects, announced in chat | Fixed, server-enforced (below) |
| `archive` | Pay-per-view access to a recorded stream | Per-archive price set by the operator, server-enforced |

### Screen effect price table

Prices are fixed in `models/donation.go` and **enforced server-side** — the client's
submitted amount is ignored for effects. USD prices apply to non-JPY currencies.

| Effect | Command | JPY | USD |
|--------|---------|-----|-----|
| Confetti | `!confetti` | ¥300 | $3 |
| Hearts | `!hearts` | ¥400 | $4 |
| Stars | `!stars` | ¥500 | $5 |
| Fireworks | `!fireworks` | ¥1,000 | $10 |
| Celebration | `!celebration` | ¥2,000 | $20 |
| Rainbow | `!rainbow` | ¥3,000 | $30 |
| Meteor | `!meteor` | ¥5,000 | $50 |
| Gold rush | `!goldrush` | ¥10,000 | $100 |

The `!command` form is how Ko-fi supporters trigger effects (see below); the site's own
purchase form offers them as a picker.

Webhook-confirmed purchases are announced to chat after a 10-second delay so the buyer has
time to return from the provider's checkout page; redirect-confirmed ones announce
immediately. **Archive purchases are never announced** — they are private entitlements.

## Provider setup

Each provider has a settings page under **Admin > Super Chat**. All admin GETs mask stored
secrets as `********` and keep the existing value if the masked placeholder is saved back.

### PayPay

Admin > Super Chat > PayPay settings.

- **Separate sandbox and production credential sets** — API key, API secret and Merchant
  ID each exist twice; the *Sandbox mode* toggle selects which set is active, so you can
  keep both configured and switch without retyping.
- Webhook URL: `https://your-domain/api/paypay/webhook`
- Security: the `X-PayPay-Signature` HMAC-SHA256 header is **mandatory** (unsigned
  webhooks are rejected), and even with a valid signature the payment state is re-confirmed
  against the PayPay API before the purchase is recorded.

### PayPal

Admin > Super Chat > PayPal settings.

- **Separate sandbox and production client credentials** (Client ID / Client Secret per
  environment), selected by the *Sandbox mode* toggle. Currency code configurable.
- Webhook URL: `https://your-domain/api/paypal/webhook`
- Security: the webhook body is not trusted — the capture is fetched directly from the
  PayPal API and must be `COMPLETED` with a matching `custom_id` (our pending-purchase ID)
  and amount before the purchase is recorded.

### Stripe

Admin > Super Chat > Stripe settings.

- **Separate test and live keys**: publishable key, secret key and webhook signing secret
  per environment, selected by the *Test mode* toggle.
- Webhook: `https://your-domain/api/stripe/webhook`, event `checkout.session.completed`.
- Security: the webhook signing secret is **mandatory** — if none is configured, incoming
  webhooks are rejected rather than processed. Signatures are verified (HMAC-SHA256 with
  replay protection); the success redirect independently fetches the Checkout Session and
  requires `payment_status == "paid"`. Amounts are taken from Stripe, not the client.
- Test card: `4242 4242 4242 4242` (any future expiry/CVC).

### Metamask / crypto

Admin > Super Chat > Metamask settings: receiving wallet address, EVM network, chain
currency, plus an optional Bitcoin Native SegWit address (`bc1...`).

Selectable networks (admin UI): Ethereum Mainnet, Sepolia (testnet), Polygon Mainnet,
Amoy (Polygon testnet), BNB Smart Chain, Arbitrum One, Optimism, Base.

- Security: **on-chain verification, fail-closed.** For EVM chains the server queries
  public RPC endpoints (publicnode.com) for the transaction and its receipt, and checks
  the destination (your wallet, or the token contract with an ERC-20 `Transfer` log to
  your wallet) and success status. Bitcoin payments are verified against
  `mempool.space` outputs. **The recorded amount is the on-chain value**, never the
  client's claim; unverifiable transactions are rejected. The tx hash yields a
  deterministic payment ID for permanent replay/duplicate protection.
- The confirmed amount is also converted to JPY (CoinGecko with CoinMarketCap fallback,
  cached) and stored in `amount_jpy` so crypto revenue appears in stats and tier colors;
  if conversion fails the purchase is still recorded with the raw crypto amount.
- Testnets (Sepolia, Amoy) are automatically flagged as test payments.

### Ko-fi

Admin > Super Chat > Ko-fi settings: enable flag, **Verification Token** (from Ko-fi's
Settings > API), optional page URL and display-name override.

- Webhook URL to set on Ko-fi: `https://your-domain/api/kofi/webhook`
- Security: the verification token is **required** — webhooks are rejected when no token
  is configured, and compared in constant time. Deliveries are idempotent on Ko-fi's
  transaction ID, so a replayed webhook cannot double-record, re-announce or re-fire an
  effect.
- Supporters can trigger a **screen effect** by starting their Ko-fi message with a
  command (e.g. `!fireworks`) *and* paying at least that effect's price; otherwise the
  payment falls through to a regular Super Chat.

### Doneru

Admin > Super Chat > Doneru settings. Doneru (https://doneru.jp) is **redirect-only**:
the purchase form sends the viewer to your Doneru page, and Doneru does not deliver a
payment confirmation back to AoiTube — so Doneru tips appear in Doneru's own overlay, not
in AoiTube's chat, stats or effects.

## Security design summary

- **Server-side confirmation only.** A purchase is recorded only from facts the provider
  confirmed: verified webhook signatures (Stripe, PayPay), API re-verification (PayPal
  capture, PayPay details, Stripe session), or on-chain checks (crypto). Success
  redirects alone never complete a purchase, and amounts always come from the provider
  or the chain — never the client.
- **Single consumption.** Pending purchases are claimed atomically
  (`ClaimPendingDonation`), so a webhook and a redirect can't both complete the same
  payment; providers with replayable IDs (Ko-fi, crypto) are additionally deduplicated by
  payment ID.
- **Fixed prices enforced.** Effect prices and archive prices are resolved on the server
  (`applyFixedEffectPrice`, archive manifest); archive purchases also require an
  authenticated buyer and reject double purchases.
- **Secrets masked** in admin GET responses (`********`), preserved on save.
- **Test payments excluded.** Sandbox/test-mode purchases are stored with an `is_test`
  flag: excluded from all stats and from pay-per-view entitlement checks, and marked with
  a "test" tag in the admin list.
- **Privacy in the public feed.** `/api/donations/recent` returns a reduced DTO: no
  payment IDs, no user IDs, blank names for anonymous buyers — and archive purchases are
  omitted entirely.

## Purchase management

**Admin > Super Chat > Purchases** (`/admin/donations`):

- Lists all purchases with a type filter (Super Chat / effect / archive); archive rows
  show the archive title. A stats dashboard (`/api/admin/donations/stats`) breaks down
  revenue by currency, provider, item and day, excluding test payments.
- **Manual grant**: give a user permanent access to an archive
  (`POST /api/admin/archives/purchases/grant`) — recorded as a zero-amount purchase with
  provider `manual`, not announced to chat, and rejected if the user already has access.
  Useful for support cases (lost webhooks, complimentary access).
- **Revoke** (`POST /api/admin/archives/purchases/revoke`): removes an archive
  entitlement; only `archive` rows can be revoked.

**Buyer-facing history**: logged-in viewers have a *Purchase history* item in the user
menu, backed by `GET /api/donations/mine` (resolved from their own access token). Archive
rows show the current title and a watch link when the archive is still available. Payment
IDs are deliberately not shown to buyers — support goes through the operator, who can see
them in the admin list.

Because purchases live in the `donations` table keyed to the viewer's account, they
survive archive deletion (audit trail) and follow the account across devices — buyers must
log in with the **same social account** they purchased with.
