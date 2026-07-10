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
| `coin` | Prepaid coin top-up credited to the buyer's wallet | Buyer-chosen; never announced in chat (see [Coin wallet](#coin-wallet)) |

### Screen effect price table

Prices are fixed in `models/donation.go` and **enforced server-side** — the client's
submitted amount is ignored for effects. Currencies without an explicit column fall back
to the USD price.

| Effect | Command | JPY | USD | EUR |
|--------|---------|-----|-----|-----|
| Confetti | `!confetti` | ¥300 | $3 | €3 |
| Hearts | `!hearts` | ¥400 | $4 | €4 |
| Stars | `!stars` | ¥500 | $5 | €5 |
| Fireworks | `!fireworks` | ¥1,000 | $10 | €10 |
| Celebration | `!celebration` | ¥2,000 | $20 | €20 |
| Rainbow | `!rainbow` | ¥3,000 | $30 | €30 |
| Meteor | `!meteor` | ¥5,000 | $50 | €50 |
| Gold rush | `!goldrush` | ¥10,000 | $100 | €100 |

The `!command` form is how Ko-fi supporters trigger effects (see below); the site's own
purchase form offers them as a picker.

Webhook-confirmed purchases are announced to chat after a 10-second delay so the buyer has
time to return from the provider's checkout page; redirect-confirmed ones announce
immediately. **Archive purchases and coin top-ups are never announced** — they are private.

## Coin wallet

Coins are an opt-in **prepaid, non-expiring balance** (off by default; enable under
**Admin > Purchases > Coins**). Viewers charge coins once, then spend them on super chats,
screen effects and paid archives without going through a provider each time.

**One coin equals one minor unit of the base currency** (¥1 per coin for JPY), so a purchase
priced in minor units costs exactly that many coins. Only the charge bonus makes coins
diverge from the fiat actually paid.

### Ledger, not a balance column

`core/data/wallet.go` stores an **append-only `wallet_ledger`**; a balance is always derived
as `SUM(delta)`. This keeps the money trail auditable — required for reporting the
outstanding balance of a prepaid instrument — and makes a silently corrupted balance
impossible. Entry types: `charge`, `bonus`, `spend`, `refund`, `admin_adjust`.

- **Charging** goes through the normal **Stripe / PayPal / PayPay** flow as an
  `item_type="coin"` purchase. It requires a signed-in buyer, and crediting is **idempotent
  on `(provider, payment_id)`** via a unique index, so the webhook and redirect paths can
  both confirm without double-crediting. The configured bonus percent is credited as a
  separate `bonus` entry. (PayPay has its own create/confirm endpoints, so the buyer
  resolution and crediting are wired there too, not only in the unified endpoint.)
- **Spending** hits `POST /api/wallet/spend`, which debits atomically (a serialized
  read-check-write refuses an overdraw), records the purchase, then broadcasts or entitles
  exactly like a provider-confirmed purchase. If the purchase row fails to write, the debit
  is refunded automatically. Coins pay for **super chats, screen effects and paid archives**
  (the archive purchase panel shows a "pay with coins" button for archives priced in the
  base currency).

### Revenue accounting (no double counting)

**Revenue is booked when coins are charged**, not when they are spent — the money arrived at
the top-up. Coin-funded purchases therefore carry `payment_provider = "coin"` and are
**excluded from every revenue aggregate** (`GetDonationTotal`, `GetMonthlyDonationTotal`,
`GetDonationStats`). They still carry `amount_jpy`, so they **do count toward the supporter
ranking** and appear in chat like any other purchase.

### Operating the wallet

- **Admin > Purchases > Coins** — enable the wallet, set the charge bonus percent, and see
  the **outstanding coin liability** (the sum of all balances). Under Japan's Payment
  Services Act an unused prepaid balance above the statutory threshold on a reporting date
  triggers deposit and filing obligations; this figure is the basis for that report.
- **Admin > Chat & Users > User Data** — open a user's 🪙 coin modal to see their balance
  and ledger, and to grant or deduct coins manually (recorded as `admin_adjust`; a deduction
  that would overdraw is refused).

## Base currency

**Admin > Super Chat > Purchases** has a **Base currency** selector (default **JPY**). The
base currency is:

- the currency crypto purchases are converted into (for the Super Chat tier colors, the
  chat amount line like `€12.00（0.004 ETH）`, and the revenue dashboard), and
- the default currency wherever none is otherwise configured (archive pricing, manual
  purchases, the crypto price feed).

Each payment provider keeps its **own** currency setting independent of the base currency:
PayPay is always JPY; PayPal and Stripe have their own currency codes; Ko-fi takes the
currency from its webhook. Changing the base currency does not touch those. Crypto amounts
already recorded under a previous base currency are excluded from the crypto revenue tile
rather than summed across currencies, so switching mid-stream never mixes units.

Amounts are stored in **minor units** (cents) for most currencies and in **major units**
for zero-decimal currencies (JPY, KRW), matching the payment providers.

## Running AoiTube outside Japan

The defaults are Japan-first, but the software runs internationally with a few changes:

1. **Base currency** — set it to your currency (Admin > Super Chat > Purchases). This
   drives crypto conversion, tiering and reporting.
2. **Providers** — enable **Stripe**, **PayPal** and/or **crypto (Metamask)**, which are
   international, and leave **PayPay** (Japan-only) and **Doneru** (Japan-only) disabled.
   Set each enabled provider's currency to match your base currency.
3. **Legal disclosure page** — the `/tokushoho` page defaults to Japan's Specified
   Commercial Transactions Act, but its title is configurable (Admin > Super Chat >
   Tokushoho settings > *Page title*, e.g. "Legal Notice" or "Impressum") and the body is
   free-form Markdown, so you can repurpose it for your jurisdiction. The GDPR cookie
   consent banner is always on.
4. **UI language** — the viewer and admin UIs ship in Japanese, English, Simplified and
   Traditional Chinese, and Korean; append `?lang=en` (etc.) or let the browser locale
   decide.

A minimal non-Japan setup is therefore: base currency = your currency, Stripe (+ optional
PayPal/crypto) configured in that currency, PayPay/Doneru off, and the legal page retitled
and rewritten for your country.

## Tax responsibilities

Selling Super Chats, effects and pay-per-view archives may create tax obligations
(consumption tax / VAT / sales tax, invoicing, and income reporting) that depend on the
operator's country and the buyer's location. AoiTube does **not** calculate, collect or
remit tax, and the fixed effect prices above are treated as tax-inclusive by the code.
Operators are responsible for their own tax compliance — for cross-border sales consider a
provider-side tax feature such as **Stripe Tax**, and consult a local tax professional.

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
currency, an optional Bitcoin Native SegWit address (`bc1...`), an optional Solana
receiving account (base58 — **not** the EVM `0x` address; they are different key systems),
and an optional Solana RPC URL (see below).

Selectable networks (donation form): Ethereum, Polygon, BNB Smart Chain, Arbitrum,
Optimism, Base, Avalanche, Linea, Sei, VirBiCoin (+ Bitcoin and Solana), and the Sepolia /
Amoy testnets. Since your receiving wallet address is the same across every EVM chain, a
buyer may pay on **any supported chain** — the server verifies on the chain the payment
was actually made on (from the request's `networkId`), not just the one set in admin.

- Security: **on-chain verification, fail-closed.** For EVM chains the server queries a
  public RPC endpoint for that chain for the transaction and its receipt, and checks the
  destination (your wallet, or the token contract with an ERC-20 `Transfer` log to your
  wallet) and success status. Bitcoin payments are verified against `mempool.space`
  outputs. **The recorded amount AND the currency symbol are derived on-chain / from
  server config**, never from the client, so a cheap transfer can't be re-labelled as an
  expensive coin. Unverifiable transactions are rejected. The tx hash yields a
  deterministic payment ID for permanent replay/duplicate protection.
- Public RPC nodes lag the wallet that broadcast a tx, so verification polls for the tx to
  appear and be mined (up to ~40s) before accepting — the confirm can take a few seconds
  to that long on slower chains.

**Solana (SOL + SPL tokens).** Handled by `controllers/solanaVerify.go`. MetaMask connects
through its **native Solana account** (the Wallet Standard, `@metamask/connect-solana`);
Phantom and Trust Wallet also work. The old Solflare "Solana Snap" is only a fallback for
older MetaMask, because it keeps a site allowlist and rejects most origins with
`Invalid origin (-32603)`.

- Verification fetches the transaction at **finalized** commitment (Solana's reorg-safety
  floor, the counterpart of EVM confirmations), requires it to have succeeded, then credits
  either an **SPL token** (a positive token-balance delta on an account the operator owns)
  or **native SOL** (a positive lamport delta on the operator's account).
- **Only USDC and USDT are accepted as SPL tokens, by mint address.** Anyone can mint a
  token and call it "USDC", so the symbol comes from the on-chain mint and any other mint is
  never credited — the same defence as the EVM path.
- A **self-transfer is refused**: if the buyer pays from the very account configured as the
  receiving address, the balance only drops by the fee and nothing is credited. The form
  also blocks this before signing so no fee is wasted. Test with a *different* wallet than
  the one set in admin.

**Solana RPC URL.** Solana's public node (`api.mainnet-beta.solana.com`) is heavily rate
limited and **refuses browser-origin requests outright (HTTP 403)**, so the donation form
never calls it directly — it goes through a same-origin, method-allowlisted proxy
(`/api/solana/rpc`). For reliable operation set a dedicated RPC (Helius, QuickNode, ...) in
the Solana RPC URL field. **A URL containing an API key is safe**: it stays server-side and
the browser only ever sees the proxy. Leave it empty to use the public node.
- The confirmed amount is also converted to the **base currency** (CoinGecko → CoinMarketCap
  → Coinpaprika fallback, cached) and stored in `amount_jpy` + `fiat_currency` so crypto
  revenue appears in stats and tier colors; if conversion fails the purchase is still
  recorded with the raw crypto amount, and the last-known price is served during a provider
  cooldown so a rate-limited free API doesn't break the price display.
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
- **Base-currency roll-up**: the dashboard headlines a single figure in the base currency —
  a base-currency purchase counts at face value, a crypto purchase at its confirmation-time
  conversion (`amount_jpy`). The raw per-currency amounts stay below as face-value detail for
  provider reconciliation. Crypto whose rate could not be captured at confirmation
  (`amount_jpy = 0`) is surfaced as an "unconverted" count so its absence from the total is
  not mistaken for zero revenue. The revenue predicate is the shared `revenueRows` fragment
  (excludes test rows, coin-funded spends, and zero-amount rows).
- **Manual grant**: give a user permanent access to an archive
  (`POST /api/admin/archives/purchases/grant`) — recorded as a zero-amount purchase with
  provider `manual`, not announced to chat, and rejected if the user already has access.
  Useful for support cases (lost webhooks, complimentary access). Because it is a free
  entitlement rather than a sale, its `amount = 0` row is **excluded from every revenue
  statistic** (count, average, provider breakdown) via `revenueRows`, while still showing in
  the purchase list so it can be revoked, and still conferring viewing access.
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
