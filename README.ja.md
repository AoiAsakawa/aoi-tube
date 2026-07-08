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

[English](README.md) | **日本語**

**セルフホスト型ライブ配信サーバー | 低遅延配信 | スーパーチャット&有料アーカイブ | 日本語対応**

[Owncast](https://github.com/owncast/owncast) のカスタマイズフォークです。

[🚀 クイックスタート](#-クイックスタート) •
[📖 ドキュメント](#-ドキュメント) •
[⚙️ 設定ガイド](#️-設定)

</div>

---

## ✨ フォーク独自の機能

### 🔐 ソーシャルログイン
| プロバイダー | 状態 |
|-------------|---------|
| X (Twitter) OAuth 2.0 | ✅ PKCE 対応 |
| Discord OAuth 2.0 | ✅ |
| Google OAuth 2.0 | ✅ |
| GitHub OAuth 2.0 | ✅ |
| IndieAuth | ✅ |
| Fediverse | ✅ |

- **アニメーション GIF 絵文字** — カスタムのアニメーション絵文字パックをチャットで利用可能
- **認証必須チャットモード** — チャットと視聴をソーシャル認証済みの視聴者に限定するオプション
- **アカウントガバナンス** — 可逆な連携解除(ソフト削除)、追記専用の監査ログ、運営者による手動復活・アカウント統合・モデレーター管理([docs/authentication.md](docs/authentication.md))

### 💰 スーパーチャット&決済
| 決済方法 | 状態 |
|---------|---------|
| PayPay | ✅ QR 決済、サンドボックス/本番の認証情報を分離 |
| PayPal | ✅ サンドボックス/本番の認証情報、海外対応 |
| Stripe | ✅ Checkout Session、テスト/本番キー |
| Metamask / 暗号資産 | ✅ マルチチェーンのオンチェーン検証(ETH、Polygon、BNB、Arbitrum、Optimism、Base、Avalanche、Linea、Sei、VirBiCoin、BTC など) |
| Ko-fi | ✅ Webhook 連携、`!effect` コマンド |
| Doneru | ✅ 外部リダイレクト連携 |

- **基準通貨を設定可能** — 既定は JPY。暗号資産換算・ティアカラー・売上集計の通貨を任意に設定でき、海外運用にも対応
- **スーパーチャット** — YouTube 風の金額別ティアカラーをチャットに表示
- **画面エフェクト** — 固定価格で購入できる 8 種類のエフェクト(¥300〜¥10,000)、価格はサーバー側で強制
- **特商法 / FAQ ページ** — 特定商取引法に基づく表記(`/tokushoho`)と FAQ(`/faq`)、管理画面から編集可能

### 📼 録画&アーカイブ(VOD)
- **配信の録画** — アーカイブは**デフォルトで非公開**として保存され、管理画面で確認・価格設定・公開ができます
- **3 段階のアクセス制御** — 公開 / メンバー限定(要ログイン)/ **有料(ペイパービュー)**、価格はサーバー側で強制
- **購入管理** — 種別フィルター付きの管理ページ、アーカイブ視聴権の**手動付与/取り消し**、購入者向けのアプリ内購入履歴
- **同期リプレイ** — チャットと画面エフェクトが映像と同期して再生されます
- **単一ファイル MP4 リプレイ** — 録画完了後、A/V 同期を保ったまま `replay.mp4` へ無劣化リマックス
- **タイトルのインライン編集とサイズ列** を管理画面のアーカイブ一覧に搭載
- **保持ポリシー** — 未公開・アクセス制限なし・購入履歴なしの録画のみを自動削除

### 💾 ストレージ&バックアップ
- **S3/R2 へのアーカイブ退避** — 配信終了後に VOD メディアをオブジェクトストレージへ移動。配信はサーバー経由のため、アクセス制御は常にサーバー側が権威を持ちます
- **ストレージ使用量&クリーンアップツール** — プレフィックス別のバケット使用量を管理 API で確認でき、ライブセグメント・孤立アーカイブ・未完了のマルチパートアップロードを掃除できます
- **ライブセグメントの自動削除** — 配信終了の 1 分後に、残った LL-HLS 用ライブセグメントを S3 から削除
- **データベースの自動バックアップ** — スケジュール実行、タイムスタンプ付与、保持数での自動削除、S3 アップロード(任意)
- **ワンコマンドでのノード移行** — 新しいノードで `./aoitube -restoreFromS3` を実行すると最新のバックアップから復元

### ⚡ 低遅延配信(LL-HLS / WebRTC)
| プロトコル | 遅延 | 状態 |
|-----------|------|---------|
| LL-HLS | 約 2〜5 秒 | ✅ 安定版 |
| WebRTC | 1 秒未満 | 🧪 実験的 |

- **fMP4 フォーマット** — LL-HLS では 1 秒セグメントを強制使用
- **実測レイテンシバッジ** — プレイヤーのバッジに、計測が集まり次第、実測遅延と解像度/fps を表示(LL-HLS・WebRTC 両対応)
- **自動フォールバック** — WebRTC 接続に失敗した場合、視聴者プレイヤーは HLS へ自動的に切り替わります
- **WebRTC には開放された UDP ポートが 1 つ必要**(デフォルト `52000`、`OWNCAST_WEBRTC_UDP_PORT` で変更可能)

### 🇯🇵 言語&UI
- 5 言語対応 UI: 日本語・英語・簡体字中国語・繁体字中国語・韓国語(視聴者画面+管理画面)
- 日本語のランダムユーザー名生成
- 統合チャット管理ページ、ダーク/ライトテーマ、Cookie 同意バナー(GDPR)

### 🛡️ セキュリティ&運用
- bcrypt によるパスワードハッシュ化、認証のレート制限、信頼済みプロキシの IP 検証
- サーバーサイドでの決済検証(Webhook 署名、API/オンチェーンでの再確認)
- **RTMPS** — TLS 終端をネイティブ対応、Stunnel/Nginx 不要
- **サイレント(テスト)配信モード** — 通知を出さずに配信し、管理者/モデレーターのみ視聴可能
- **セッション単位のチャット履歴** — 視聴者には現在の配信セッションのチャットのみ表示

---

## 🛠️ 技術スタック

| カテゴリ | 技術 |
|---------|------|
| **バックエンド** | Go 1.25+、SQLite、sqlc |
| **フロントエンド** | Vite 8 + React Router、React 19、TypeScript 6、Ant Design 6、Zustand |
| **テスト** | Vitest、Testing Library |
| **コンポーネント** | Storybook v10 |
| **スタイリング** | Tailwind CSS 4、SCSS |
| **配信** | RTMP/RTMPS → FFmpeg → HLS / LL-HLS / WebRTC(Pion SFU) |

---

## 📡 配信プロトコル

| プロトコル | 遅延 | 状態 | 説明 |
|-----------|------|---------|------|
| **HLS** | 10〜30 秒 | ✅ 安定版 | 標準的な HTTP ストリーミング |
| **LL-HLS** | 約 2〜5 秒 | ✅ 安定版 | 低遅延 HLS(fMP4、1 秒セグメント) |
| **WebRTC** | 1 秒未満 | 🧪 実験的 | 超低遅延(Pion SFU) |

プロトコルは **管理画面 > 設定 > 配信プロトコル** で設定します。運用の詳細
(WebRTC のファイアウォール要件、録画、アーカイブ、ストレージ)は
[docs/streaming-and-archives.md](docs/streaming-and-archives.md) を参照してください。

---

## 🚀 クイックスタート

### 📋 必要要件

| ソフトウェア | バージョン |
|-------------|-----------|
| Go | 1.25+ |
| FFmpeg | 4.1.5+ |
| Node.js | 24+ |

### 📦 インストール

```bash
# リポジトリをクローン
git clone https://github.com/AoiAsakawa/aoitube.git
cd aoitube

# フロントエンドをビルド
./build/web/bundleWeb.sh

# バックエンドをビルド
go build -o aoitube main.go

# 起動
./aoitube
```

🌐 **Web アクセス**: `http://localhost:8080`  
🔧 **管理画面**: `http://localhost:8080/admin`(初期パスワード: `abc123`)

### 🐳 Docker

```bash
docker build -t aoitube .
docker run -p 8080:8080 -p 1935:1935 -v ./data:/app/data aoitube
```

---

## ⚙️ 設定

<details>
<summary><b>🔷 X (Twitter) 認証の設定</b></summary>

1. [X Developer Portal](https://developer.x.com/en/portal/dashboard) でアプリを作成
2. Callback URL に `https://your-domain/api/auth/x/callback` を設定
3. 管理画面 > ソーシャル設定 > X 認証設定 に Client ID/Secret を入力

</details>

<details>
<summary><b>🟣 Discord 認証の設定</b></summary>

1. [Discord Developer Portal](https://discord.com/developers/applications) でアプリを作成
2. OAuth2 > Redirects に `https://your-domain/api/auth/discord/callback` を追加
3. 管理画面 > ソーシャル設定 > Discord 認証設定 に Client ID/Secret を入力

</details>

<details>
<summary><b>🔴 Google 認証の設定</b></summary>

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) で OAuth 2.0 クライアントを作成
2. 承認済みのリダイレクト URI に `https://your-domain/api/auth/google/callback` を追加
3. 管理画面 > ソーシャル設定 > Google 認証設定 に Client ID/Secret を入力

</details>

<details>
<summary><b>⚫ GitHub 認証の設定</b></summary>

1. [GitHub Developer Settings](https://github.com/settings/developers) で OAuth アプリを作成
2. Authorization callback URL に `https://your-domain/api/auth/github/callback` を設定
3. 管理画面 > ソーシャル設定 > GitHub 認証設定 に Client ID/Secret を入力

</details>

<details>
<summary><b>💳 決済プロバイダーの設定(PayPay / PayPal / Stripe / Metamask / Ko-fi / Doneru)</b></summary>

各プロバイダーの設定ページは **管理画面 > スーパーチャット** 配下にあります(PayPay、PayPal、
Stripe、Metamask、Ko-fi、Doneru の各設定)。設定手順、Webhook URL、セキュリティ上の注意、
画面エフェクトの価格表は [docs/payments.md](docs/payments.md) に記載しています。

クイックリファレンス:

| プロバイダー | Webhook / コールバック URL |
|----------|------------------------|
| Stripe | `https://your-domain/api/stripe/webhook`(イベント: `checkout.session.completed`) |
| PayPal | `https://your-domain/api/paypal/webhook` |
| PayPay | `https://your-domain/api/paypay/webhook` |
| Ko-fi | `https://your-domain/api/kofi/webhook` |

</details>

<details>
<summary><b>💬 チャット参加に認証を必須にする</b></summary>

管理画面 > チャット設定 で「チャット参加にソーシャル認証を必須にする」を有効にします。
有効にすると、未認証の訪問者はチャットも配信の再生もできなくなります。

</details>

<details>
<summary><b>🔒 RTMPS(暗号化配信)の設定</b></summary>

このフォークは RTMPS をネイティブサポートしています。Stunnel/Nginx は不要です。

#### Let's Encrypt 証明書を使う場合

1. 管理画面 > サーバー設定 > RTMPS 設定 を開く
2. 以下を設定:
   - **RTMPS を有効にする**: ON
   - **RTMPS ポート**: `1936`(デフォルト)
   - **SSL 証明書のパス**: `/etc/letsencrypt/live/your-domain.com/fullchain.pem`
   - **秘密鍵のパス**: `/etc/letsencrypt/live/your-domain.com/privkey.pem`
3. AoiTube サーバーを再起動

#### OBS の設定

| 設定項目 | 値 |
|------|-----|
| サービス | カスタム |
| サーバー | `rtmps://your-domain.com:1936/live` |
| ストリームキー | 管理画面に表示されるキー |

#### 証明書の自動更新

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
<summary><b>📼 録画・アーカイブ・ペイパービュー</b></summary>

**管理画面 > 設定 > 映像 > 録画** で録画を有効にします。録画が完了すると
**管理画面 > アーカイブ** に表示され、プレビュー、タイトル設定、価格設定
(公開 / メンバー限定 / 有料)、公開ができます。詳細は
[docs/streaming-and-archives.md](docs/streaming-and-archives.md) を参照してください。

</details>

---

## 💻 開発

### 🧑‍💻 開発環境のセットアップ

```bash
# 開発サーバーを起動
./start.sh

# フロントエンド開発(ホットリロード)
cd web
npm install
npm run dev

# バックエンドのテスト
go test ./...

# フロントエンドのテスト
cd web && npm test

# i18n カタログの整合性チェック(5 言語)
cd web && npm run check:i18n

# Lint
cd web && npm run lint
```

開発ガイドの全体は [docs/development.md](docs/development.md) を参照してください。

### 💾 メモリ不足への対処

<details>
<summary>VPS のメモリが少ない場合</summary>

```bash
# スワップを追加
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# またはヒープサイズを指定
NODE_OPTIONS="--max-old-space-size=1536" ./build/web/bundleWeb.sh
```

</details>

---

## 📁 ディレクトリ構成

```
aoitube/
├── 📄 main.go              # エントリーポイント
├── 📂 config/              # 設定定数
├── 📂 core/                # コアロジック(チャット、トランスコード、録画、webrtc、バックアップ)
├── 📂 controllers/         # HTTP ハンドラー
├── 📂 auth/                # 認証クライアント(X、Discord、Google、GitHub、IndieAuth)
├── 📂 router/              # ルーティングとミドルウェア
├── 📂 integrations/        # 外部サービス連携(PayPay など)
├── 📂 activitypub/         # ActivityPub / Fediverse 連携
├── 📂 web/                 # Vite + React フロントエンド
├── 📂 static/              # 埋め込み静的ファイル
└── 📂 data/                # ランタイムデータ(DB、ログ、録画など)
```

---

## 📖 ドキュメント

| ドキュメント | 説明 |
|------------|------|
| [docs/streaming-and-archives.md](docs/streaming-and-archives.md) | 配信プロトコル、録画、アーカイブ、PPV アクセス制御、S3 退避、ストレージ掃除 |
| [docs/payments.md](docs/payments.md) | 決済プロバイダー設定、基準通貨、画面エフェクト価格、購入管理、セキュリティ設計 |
| [docs/authentication.md](docs/authentication.md) | ソーシャルログイン、アカウントガバナンス、監査ログ、統合・復活、モデレーター |
| [docs/development.md](docs/development.md) | 開発環境、ビルド、テスト |
| [docs/database-operations.md](docs/database-operations.md) | データベースの運用手順 |
| [docs/backup-and-migration.md](docs/backup-and-migration.md) | 自動バックアップとノード移行 |
| [docs/release.md](docs/release.md) | リリース手順 |
| [docs/SECURITY.md](docs/SECURITY.md) | セキュリティポリシー |
| [CLAUDE.md](CLAUDE.md) | 開発者向けプロジェクトコンテキスト(日本語) |
| [Owncast 本家ドキュメント](https://owncast.online/docs/) | 基本的な使い方 |

---

## 🤝 コントリビュート

コントリビュートを歓迎します!

1. このリポジトリをフォーク
2. フィーチャーブランチを作成(`git checkout -b feature/amazing-feature`)
3. 変更をコミット(`git commit -m 'Add some amazing feature'`)
4. ブランチへプッシュ(`git push origin feature/amazing-feature`)
5. プルリクエストを作成

詳細は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

---

## 📜 ライセンス

MIT License — 詳細は [LICENSE](LICENSE) を参照してください。

---

## 🙏 クレジット

<table>
<tr>
<td align="center">
<a href="https://github.com/owncast/owncast">
<img src="https://owncast.online/images/logo.png" width="60"><br>
<sub><b>Owncast</b></sub>
</a><br>
<sub>アップストリームプロジェクト</sub>
</td>
<td align="center">
<a href="https://github.com/gabek">
<img src="https://avatars.githubusercontent.com/u/256491?v=4" width="60"><br>
<sub><b>Gabe Kangas</b></sub>
</a><br>
<sub>Owncast 作者</sub>
</td>
</tr>
</table>

---

<div align="center">

**このフォークは Aoi Asakawa がメンテナンスしています**

⭐ このプロジェクトが役に立ったら、スターをお願いします!

</div>
