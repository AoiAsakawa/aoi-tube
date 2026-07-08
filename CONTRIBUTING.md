# Contributing to AoiTube

This repository is a customized fork of [Owncast](https://github.com/owncast/owncast).

> **Version**: 0.3.0

## About This Fork

AoiTube (AoiAsakawa/aoitube) is a customized version with the following added features:

- 🇯🇵 Japanese-first UI with 5-language i18n (ja / en / zh / zh-TW / ko)
- ⚡ LL-HLS (low-latency HLS) and experimental WebRTC delivery
- 🔐 Social login — X (OAuth 2.0 + PKCE), Discord, Google, GitHub, IndieAuth, Fediverse
- 💰 Super Chat & screen-effect purchases — PayPay / PayPal / Stripe / Metamask (crypto) / Ko-fi / Doneru
- 📼 Stream recording, archives and pay-per-view with synchronized chat replay
- 💾 S3/R2 media offload, automatic database backups and one-command node migration
- 🔒 RTMPS (encrypted RTMP) support
- 🛡️ Hardened payment verification, trusted-proxy handling and access gating

See [README.md](README.md) for the full feature list and
[docs/development.md](docs/development.md) for the developer guide.

## How to Contribute

### Bug Reports & Feature Requests

1. Check the existing issues on [Issues](https://github.com/AoiAsakawa/aoitube/issues)
2. Open a new issue to report

### Pull Requests

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push the branch (`git push origin feature/amazing-feature`)
5. Open a pull request

## Setting Up a Development Environment

### Requirements

| Software | Version |
|-------------|-----------|
| Go | 1.25+ |
| FFmpeg | 4.1.5+ |
| Node.js | 24+ |

### Setup

```bash
# Clone the repository
git clone https://github.com/AoiAsakawa/aoitube.git
cd aoitube

# Install frontend dependencies
cd web && npm install && cd ..

# Start the development server
./start.sh

# Frontend development (in a separate terminal)
cd web && npm run dev
```

### Testing & Linting

```bash
# Backend
go build ./...
go vet ./...
go test ./...

# Frontend
cd web

# Run tests
npm test

# Lint, type-check, and format check
npm run check

# i18n catalog parity (all 5 locales must stay in sync)
npm run check:i18n

# Fix formatting
npm run format
```

The full set of quality gates, build details and repository conventions are
documented in [docs/development.md](docs/development.md).

## Coding Standards

- **Go**: format with `gofmt`; keep `golangci-lint` clean for touched packages
- **TypeScript/JavaScript**: ESLint + Prettier
- **Language**: code, comments and commit messages are written in English
  (only `CLAUDE.md` is maintained in Japanese)
- **User-facing strings**: always go through i18n (`t('...')`) and must be
  added to all five locale catalogs
- **Commit messages**: clear and concise

## Code of Conduct

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Contributing to Upstream Owncast

For contributing to upstream Owncast, see the [official Owncast website](https://owncast.online/help/).
