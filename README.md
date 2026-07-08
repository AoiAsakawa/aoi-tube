<div align="center">

# 🎬 AoiTube

[![Go Version](https://img.shields.io/badge/Go-1.25+-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Ant Design](https://img.shields.io/badge/Ant%20Design-6-0170FE?style=flat-square&logo=antdesign&logoColor=white)](https://ant.design/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://sqlite.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/Version-0.3.0-blue?style=flat-square)](https://github.com/AoiAsakawa/aoitube/releases)

**English** | [日本語](README.ja.md)

**Self-hosted live streaming server | Low-latency streaming | Super Chat & pay-per-view archives | Japanese language support**

A customized fork of [Owncast](https://github.com/owncast/owncast).

[🚀 Quick Start](#-quick-start) •
[📖 Documentation](#-documentation) •
[⚙️ Configuration Guide](#️-configuration)

</div>

---

## ✨ Fork Features

### 🔐 Social Login
| Provider | Status |
|-------------|---------|
| X (Twitter) OAuth 2.0 | ✅ PKCE supported |
| Discord OAuth 2.0 | ✅ |
| Google OAuth 2.0 | ✅ |
| GitHub OAuth 2.0 | ✅ |
| IndieAuth | ✅ |
| Fediverse | ✅ |

- **Animated GIF emoji** — custom animated emoji packs usable in chat
- **Require-auth chat mode** — optionally restrict chat and playback to socially authenticated viewers
- **Account governance** — reversible unlink (soft delete), append-only audit log, and operator tools for manual recovery, account merge and moderator management (see [docs/authentication.md](docs/authentication.md))

### 💰 Super Chat & Payments
| Payment method | Status |
|---------|---------|
| PayPay | ✅ QR payment, separate sandbox/production credentials |
| PayPal | ✅ Sandbox/production credentials, international |
| Stripe | ✅ Checkout Session, test/live keys |
| Metamask / crypto | ✅ Multi-chain on-chain verification (ETH, Polygon, BNB, Arbitrum, Optimism, Base, Avalanche, Linea, Sei, VirBiCoin, BTC…) |
| Ko-fi | ✅ Webhook integration, `!effect` commands |
| Doneru | ✅ External redirect integration |

- **Configurable base currency** — JPY by default; set your own currency for crypto conversion, tier colors and revenue reporting (international operation supported)
- **Super Chat** — YouTube-style amount tier colors in chat
- **Screen effects** — 8 fixed-price purchasable effects (¥300–¥10,000), server-enforced prices
- **Tokushoho / FAQ pages** — Japanese commerce-law disclosure (`/tokushoho`) and FAQ (`/faq`), editable from the admin panel

### 📼 Recording & Archives (VOD)
- **Stream recording** — archives finish **hidden by default**; review, price and publish them from the admin panel
- **Three access tiers** — public / members-only (login required) / **paid (pay-per-view)** with server-enforced pricing
- **Purchase management** — admin page with type filters, **manual grant/revoke** of archive access; buyers get an in-app purchase history
- **Synced replay** — chat and screen effects replay in sync with the video
- **Single-file MP4 replay** — finished recordings are losslessly remuxed to `replay.mp4` for accurate A/V sync
- **Inline title editing & size column** in the admin archive list
- **Retention** — auto-prune only unpublished, unrestricted, never-purchased recordings

### 💾 Storage & Backup
- **S3/R2 archive offload** — VOD media moves to object storage after each stream, served through the server so access gates stay authoritative
- **Storage usage & cleanup tools** — admin APIs report per-prefix bucket usage and clean up live segments, orphaned archives and incomplete multipart uploads
- **Automatic live-segment purge** — leftover live HLS segments are deleted from S3 one minute after a stream ends
- **Automatic database backups** — scheduled, timestamped, retention-pruned, optional S3 upload
- **One-command node migration** — `./aoitube -restoreFromS3` restores the newest backup on a fresh node

### ⚡ Low-Latency Streaming (LL-HLS / WebRTC)
| Protocol | Latency | Status |
|-----------|------|---------|
| LL-HLS | ~2–5s | ✅ Stable |
| WebRTC | <1s | 🧪 Experimental |

- **fMP4 format** — LL-HLS uses forced 1-second segments
- **Measured-latency badge** — the player badge shows real measured latency and resolution/fps once samples arrive (both LL-HLS and WebRTC)
- **Automatic fallback** — the viewer player falls back to HLS when a WebRTC connection fails
- **WebRTC requires one open UDP port** (default `52000`, configurable via `OWNCAST_WEBRTC_UDP_PORT`)

### 🇯🇵 Language & UI
- 5-language UI: Japanese, English, Simplified/Traditional Chinese, Korean (viewer + admin)
- Random Japanese username generation
- Unified chat management page, dark/light themes, cookie consent banner (GDPR)

### 🛡️ Security & Operations
- bcrypt password hashing, auth rate limiting, trusted-proxy IP validation
- Server-side payment verification (webhook signatures, API/on-chain re-checks)
- **RTMPS** — native TLS termination, no Stunnel/Nginx required
- **Silent (test) stream mode** — stream without notifications; only admins/moderators can watch
- **Session-scoped chat history** — viewers only see chat from the current stream session

---

## 🛠️ Tech Stack

| Category | Technology |
|---------|------|
| **Backend** | Go 1.25+, SQLite, sqlc |
| **Frontend** | Vite 8 + React Router, React 19, TypeScript 6, Ant Design 6, Zustand |
| **Testing** | Vitest, Testing Library |
| **Components** | Storybook v10 |
| **Styling** | Tailwind CSS 4, SCSS |
| **Streaming** | RTMP/RTMPS → FFmpeg → HLS / LL-HLS / WebRTC (Pion SFU) |

---

## 📡 Streaming Protocols

| Protocol | Latency | Status | Description |
|-----------|------|---------|------|
| **HLS** | 10–30s | ✅ Stable | Standard HTTP streaming |
| **LL-HLS** | ~2–5s | ✅ Stable | Low-latency HLS (fMP4, 1-second segments) |
| **WebRTC** | <1s | 🧪 Experimental | Ultra-low latency (Pion SFU) |

Protocols are configured in **Admin > Settings > Streaming Protocol**. See
[docs/streaming-and-archives.md](docs/streaming-and-archives.md) for operational details
(WebRTC firewall requirements, recording, archives, storage).

---

## 🚀 Quick Start

### 📋 Requirements

| Software | Version |
|-------------|-----------|
| Go | 1.25+ |
| FFmpeg | 4.1.5+ |
| Node.js | 24+ |

### 📦 Installation

```bash
# Clone the repository
git clone https://github.com/AoiAsakawa/aoitube.git
cd aoitube

# Build the frontend
./build/web/bundleWeb.sh

# Build the backend
go build -o aoitube main.go

# Run
./aoitube
```

🌐 **Web access**: `http://localhost:8080`  
🔧 **Admin panel**: `http://localhost:8080/admin` (default password: `abc123`)

### 🐳 Docker

```bash
docker build -t aoitube .
docker run -p 8080:8080 -p 1935:1935 -v ./data:/app/data aoitube
```

---

## ⚙️ Configuration

<details>
<summary><b>🔷 X (Twitter) Authentication Setup</b></summary>

1. Create an app in the [X Developer Portal](https://developer.x.com/en/portal/dashboard)
2. Set the Callback URL to `https://your-domain/api/auth/x/callback`
3. Enter the Client ID/Secret in Admin > Social Settings > X Authentication Settings

</details>

<details>
<summary><b>🟣 Discord Authentication Setup</b></summary>

1. Create an app in the [Discord Developer Portal](https://discord.com/developers/applications)
2. Add `https://your-domain/api/auth/discord/callback` to OAuth2 > Redirects
3. Enter the Client ID/Secret in Admin > Social Settings > Discord Authentication Settings

</details>

<details>
<summary><b>🔴 Google Authentication Setup</b></summary>

1. Create an OAuth 2.0 client in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Add `https://your-domain/api/auth/google/callback` to the authorized redirect URIs
3. Enter the Client ID/Secret in Admin > Social Settings > Google Authentication Settings

</details>

<details>
<summary><b>⚫ GitHub Authentication Setup</b></summary>

1. Create an OAuth app in [GitHub Developer Settings](https://github.com/settings/developers)
2. Set the Authorization callback URL to `https://your-domain/api/auth/github/callback`
3. Enter the Client ID/Secret in Admin > Social Settings > GitHub Authentication Settings

</details>

<details>
<summary><b>💳 Payment Provider Setup (PayPay / PayPal / Stripe / Metamask / Ko-fi / Doneru)</b></summary>

Each provider has its own page under **Admin > Super Chat** (PayPay, PayPal, Stripe,
Metamask, Ko-fi, Doneru settings). Setup steps, webhook URLs, security notes and the
screen-effect price table are documented in [docs/payments.md](docs/payments.md).

Quick reference:

| Provider | Webhook / callback URL |
|----------|------------------------|
| Stripe | `https://your-domain/api/stripe/webhook` (event: `checkout.session.completed`) |
| PayPal | `https://your-domain/api/paypal/webhook` |
| PayPay | `https://your-domain/api/paypay/webhook` |
| Ko-fi | `https://your-domain/api/kofi/webhook` |

</details>

<details>
<summary><b>💬 Require Authentication to Join Chat</b></summary>

Enable "Require social authentication to join chat" in Admin > Chat Settings.
When enabled, unauthenticated visitors cannot chat or play the stream.

</details>

<details>
<summary><b>🔒 RTMPS (Encrypted Streaming) Setup</b></summary>

This fork natively supports RTMPS. No Stunnel/Nginx required.

#### Using a Let's Encrypt Certificate

1. Open Admin > Server Settings > RTMPS Settings
2. Configure the following:
   - **Enable RTMPS**: ON
   - **RTMPS port**: `1936` (default)
   - **SSL certificate path**: `/etc/letsencrypt/live/your-domain.com/fullchain.pem`
   - **Private key path**: `/etc/letsencrypt/live/your-domain.com/privkey.pem`
3. Restart the AoiTube server

#### OBS Settings

| Setting | Value |
|------|-----|
| Service | Custom |
| Server | `rtmps://your-domain.com:1936/live` |
| Stream key | The key shown in the admin panel |

#### Automatic Certificate Renewal

```bash
# /etc/letsencrypt/renewal-hooks/deploy/restart-aoitube.sh
#!/bin/bash
systemctl restart aoitube
```

```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/restart-aoitube.sh
```

</details>

<details>
<summary><b>📼 Recording, Archives & Pay-Per-View</b></summary>

Enable recording in **Admin > Settings > Video > Recording**. Finished recordings appear in
**Admin > Archives** where you can preview, title, price (public / members-only / paid) and
publish them. See [docs/streaming-and-archives.md](docs/streaming-and-archives.md).

</details>

---

## 💻 Development

### 🧑‍💻 Development Environment Setup

```bash
# Start the development server
./start.sh

# Frontend development (hot reload)
cd web
npm install
npm run dev

# Backend tests
go test ./...

# Frontend tests
cd web && npm test

# i18n catalog parity check (5 languages)
cd web && npm run check:i18n

# Lint
cd web && npm run lint
```

See [docs/development.md](docs/development.md) for the full development guide.

### 💾 Handling Low Memory

<details>
<summary>When your VPS has limited memory</summary>

```bash
# Add swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Or specify the heap size
NODE_OPTIONS="--max-old-space-size=1536" ./build/web/bundleWeb.sh
```

</details>

---

## 📁 Directory Structure

```
aoitube/
├── 📄 main.go              # Entry point
├── 📂 config/              # Configuration constants
├── 📂 core/                # Core logic (chat, transcoding, recording, webrtc, backup)
├── 📂 controllers/         # HTTP handlers
├── 📂 auth/                # Authentication clients (X, Discord, Google, GitHub, IndieAuth)
├── 📂 router/              # Routing and middleware
├── 📂 integrations/        # External service integrations (PayPay, etc.)
├── 📂 activitypub/         # ActivityPub / Fediverse integration
├── 📂 web/                 # Vite + React frontend
├── 📂 static/              # Embedded static files
└── 📂 data/                # Runtime data (DB, logs, recordings, etc.)
```

---

## 📖 Documentation

| Document | Description |
|------------|------|
| [docs/streaming-and-archives.md](docs/streaming-and-archives.md) | Stream protocols, recording, archives, PPV access tiers, S3 offload, storage cleanup |
| [docs/payments.md](docs/payments.md) | Payment provider setup, base currency, screen effect prices, purchase management, security design |
| [docs/authentication.md](docs/authentication.md) | Social login, account governance, audit log, merge/recovery, moderators |
| [docs/development.md](docs/development.md) | Development environment, build, tests |
| [docs/database-operations.md](docs/database-operations.md) | Database operation procedures |
| [docs/backup-and-migration.md](docs/backup-and-migration.md) | Automatic backups & node migration |
| [docs/release.md](docs/release.md) | Release procedure |
| [docs/SECURITY.md](docs/SECURITY.md) | Security policy |
| [CLAUDE.md](CLAUDE.md) | Project context for developers (Japanese) |
| [Upstream Owncast documentation](https://owncast.online/docs/) | Basic usage |

---

## 🤝 Contributing

Contributions are welcome!

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Credits

<table>
<tr>
<td align="center">
<a href="https://github.com/owncast/owncast">
<img src="https://owncast.online/images/logo.png" width="60"><br>
<sub><b>Owncast</b></sub>
</a><br>
<sub>Upstream project</sub>
</td>
<td align="center">
<a href="https://github.com/gabek">
<img src="https://avatars.githubusercontent.com/u/256491?v=4" width="60"><br>
<sub><b>Gabe Kangas</b></sub>
</a><br>
<sub>Owncast author</sub>
</td>
</tr>
</table>

---

<div align="center">

**This fork is maintained by Aoi Asakawa**

⭐ If you find this project useful, please give it a star!

</div>
