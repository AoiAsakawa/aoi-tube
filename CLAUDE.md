# CLAUDE.md - AoiTube プロジェクトコンテキスト

このファイルはClaude AI（Claude Code等）がAoiTubeのコードベースを理解するためのコンテキストを提供します。コード・コミットメッセージ・ドキュメントは英語で統一します（例外はこのファイル、README.ja.md、i18n/ローカライズ資産のみ）。

> **バージョン**: 0.3.0（ベースは Owncast v0.1.1 + v0.2.5からの選択的移植）

## プロジェクト概要

AoiTubeはセルフホスト型のライブストリーミングサーバーです（[Owncast](https://github.com/owncast/owncast) のフォーク）。OBS等からRTMPで配信を受け取り、HLS/LL-HLS/WebRTCで視聴者に配信します。

**Owncastからの主な追加機能**:

- 日本語ファーストUI + 5言語i18n（ja/en/zh/zh-TW/ko、視聴者+管理画面）
- **LL-HLS**（1秒セグメントfMP4、実測2-5秒）・**WebRTC**（実験的、1秒以下、Pion SFU）+ 実測レイテンシ/解像度バッジ
- ソーシャル認証6種: X OAuth2+PKCE（GIF絵文字）/ Discord / Google / GitHub / IndieAuth / Fediverse。**認証ガバナンス**: ソフト削除（失効=可逆）、監査ログ、運営者による手動復活・アカウント統合・モデレーター管理
- **購入システム**（投げ銭ではなくサービス購入の体裁）: スーパーチャット（YouTube準拠の金額ティア色）+ 画面演出8種（¥300〜¥10,000固定価格・サーバー強制、**全てCSS描画**・価格ティア順に豪華化）+ アーカイブPPV。**基準通貨は設定可能**（既定JPY、国際運用対応）
- **コインウォレット**（プリペイド・台帳ベース）: チャージ（Stripe/PayPal・ボーナス%）⇄ 直接課金の切替、残高でスパチャ/ギフト/PPVを支払い。**売上はチャージ時計上**（コイン払いは二重計上せずランキングのみ反映）。管理: 未使用残高（負債）表示・ユーザー別の残高/手動付与/台帳履歴
- 決済6種: PayPay（サンドボックス/本番キー分離）/ PayPal / Stripe / Metamask暗号資産（マルチチェーン・オンチェーン検証）/ Ko-fi / Doneru
- **録画・アーカイブ**: 3層アクセス（公開/会員限定/有料）、replay.mp4無劣化リマックス、チャット・演出同期リプレイ、容量表示、タイトル編集、保持数制限（売り物保護付き）
- **追っかけ再生（ライブDVR）**: ライブプレイヤーの統一シークバーで配信開始まで巻き戻し（YouTube風）。ライブ端は低遅延LL-HLS、巻き戻すと録画ソースへ透過切替
- **外部配信ソース**（AWS IVS / IVS互換）: 配信をマネージドサービスに委譲し、自ホストのトランスコードなしで視聴
- **サポーターランキング** / **配信スケジュール**（オフライン画面に次回予定）
- **購入管理**（管理画面: 種類フィルタ・手動付与・取消）+ 購入者向け購入履歴
- S3/R2メディアオフロード + 自動DBバックアップ + `-restoreFromS3` ワンコマンド移行
- RTMPS（ネイティブTLS終端）、サイレントテストモード、チャット履歴の配信セッションスコープ
- 特商法表記・FAQページ（購入体裁、markdown管理）

## 技術スタック

- **バックエンド**: Go 1.25、SQLite（sqlc）、aws-sdk-go-v2（S3/R2）、Pion WebRTC v4（moduleパス: `github.com/aoiasakawa/aoitube`）
- **フロントエンド**: Vite 8（rolldown）/ React 19 / TypeScript 6 / react-router 7 / Ant Design 6.5 / Zustand / react-i18next / hls.js（プレイヤーエンジン、**video.jsは撤去**）
- **テスト**: Vitest 4 / Testing Library / Storybook 10（react-viteフレームワーク）
- **ストリーミング**: RTMP/RTMPS入力 → FFmpeg → HLS/LL-HLS出力 + WebRTC再エンコードtee
- **リンタ**: ESLint 10（flat config）+ Prettier、golangci-lint v2

## ディレクトリ構成

```
/
├── main.go                 # エントリーポイント（-restoreFromS3等のCLIフラグ）
├── config/                 # 設定定数（StaticVersionNumber等）
├── core/
│   ├── data/              # データストア（SQLite設定読み書き）
│   ├── chat/              # チャット（persistence=履歴+2hプルーナー、pruner）
│   ├── transcoder/        # FFmpeg（transcoder.go=HLS、llhls.go=LL-HLS）
│   ├── recording/         # 録画・アーカイブ（recorder.go、S3オフロード）
│   ├── storageproviders/  # s3Storage.go(ライブHLS)+archiveS3.go(アーカイブ/バックアップ)
│   ├── webrtc/            # SFU + メディアパイプライン
│   ├── rtmp/              # RTMP/RTMPS受信
│   └── backup.go          # 自動バックアップスケジューラ
├── controllers/            # HTTPハンドラ（admin/ = 管理API、auth/ = 認証）
├── router/                 # ルーティング・ミドルウェア（認証レート制限）
├── auth/                   # 認証クライアント（x/discord/google/github/indieauth）
├── integrations/paypay/    # PayPay APIクライアント
├── static/                 # 埋め込み静的ファイル（go:embed、static/web=ビルド済みバンドル）
├── web/                    # Vite+Reactソース（src/=エントリ、pages/、components/）
├── activitypub/            # Fediverse連携
├── db/                     # sqlcスキーマ・生成コード
└── data/                   # ランタイムデータ（DB・ログ・archives/、コミット対象外）
```

## 管理画面メニュー構成

ホーム / 視聴者 / チャット・ユーザー（チャット管理・**ユーザーデータ**[認証履歴・モデレーター・統合・**コイン管理**]・絵文字）/ フォロワー（Fediverse時）/ **購入・収益**（購入管理・**コイン設定**・PayPay/PayPal/Stripe/Metamask/Ko-fi/Doneru設定・特商法・FAQ）/ 設定（一般[**配信スケジュール**]・サーバー[RTMPS/ストレージ/バックアップ]・動画[録画]・配信プロトコル[**外部配信ソース**]・チャット・ソーシャル[認証]・Fediverse・通知[サイレントモード]）/ アーカイブ / ユーティリティ（ハードウェア・配信状態・ログ）/ 連携（Webhook・アクセストークン・外部アクション）

**【重要】管理画面はfile-based routingではない**: 新規ページは `web/pages/admin/*.tsx` を作るだけでは表示されず、**`web/src/routes/admin.tsx` のルートテーブルにimport+`{ path, element }` の登録が必須**（未登録だとナビのリンクが別ページにフォールバックする。config-coins追加時に踏んだ）。

## ビルド・実行・ゲート

```bash
./start.sh                          # 開発起動
./build/web/bundleWeb.sh            # フロントビルド → static/web（go:embed）
go build -o aoitube main.go         # 本番ビルド
cd web && npm run dev               # フロント開発サーバー（:3000、プロキシ→:8080）

# ゲート（コミット/デプロイ前に全部）
go build ./... && go vet ./... && go test ./...
cd web && npx tsc --noEmit && npx eslint . && npx vitest run && npm run check:i18n
```

- **バージョン更新**: `config/constants.go` の `StaticVersionNumber`
- **新規API**: `router/router.go` で登録、管理APIは `RequireAdminAuth` 必須
- デプロイ・リリース手順は `docs/release.md`、バックアップ・移行は `docs/backup-and-migration.md` 参照
- 合成RTMPテスト入力例: `ffmpeg -re -f lavfi -i testsrc2 ... -f flv rtmp://localhost:1935/live/<streamkey>`（`test/ocTestStream.sh` 参照）

## 機能リファレンス（キー実装と設定キー）

### 配信・録画・アーカイブ
- **LL-HLS**: `core/transcoder/`（`llhls.go`+`llhlsMuxer.go`+`llhlsFfmpeg.go`）。**gohlslib(v2)のLow-Latencyミキサーをレンディション毎に持つ真のLL-HLS**（EXT-X-PART+ブロッキング更新+PRELOAD-HINT）。1本のffmpegが各レンディションをMPEG-TSで吐き→mediacommonでデマックス→gohlslibミキサーへ`WriteH264/WriteMPEG4Audio`（音声PTSは90kHz→サンプルレートclockへ再スケール必須）。ABRマスターは合成（`masterPlaylist`）、**各レンディションに個別音声**（共有音声だとトランスコード映像のライブエッジ遅れでカクつくため）、**全ミキサー共有のPDT**（ソースPTS由来、`ntpForPTS`）、トランスコードは`-force_key_frames source`でパススルーとセグメント境界一致。**メモリ内配信＝ディスクに書かない**（録画/サムネは上記diskMirror併走で供給）。設定 `/admin/config-stream-protocol`
- **WebRTC**: `core/webrtc/sfu.go`+`mediapipeline.go`。専用FFmpegで再エンコード→RTP→Pion。**コーデック**: 映像=constrained-baseline H.264 6Mbps（high profile 1080p60は4コアで実時間エンコードできずA/Vドリフト＝baseline確定）／音声=**ステレオOpus**（Pionはアンサーでオファー側のmono fmtpをエコーするため`sfu.go forceOpusStereo`がアンサーSDPに`stereo=1;sprop-stereo=1`を注入。SFUは`RegisterDefaultCodecs`をやめ必要コーデックだけ明示登録）+ constrained-VBR + FEC(`packet_loss=15`)。**単一UDPポート52000（要FW開放）**。ポートは管理画面「配信プロトコル」の `WebRTCUDPPort`（`StreamProtocolConfig`）またはenv `OWNCAST_WEBRTC_UDP_PORT`（env優先）で変更可、`sfu.go webRTCUDPPort()` が env→datastore→既定で解決。**起動時に一度だけbind**（`GetSFU`）のため変更は再起動後反映（`ReloadConfig`は再bindしない）。RTMPは非ブロッキングtee（`core/webrtcMediaTee.go`）でHLS影響ゼロ。接続失敗時HLS自動フォールバック
- **録画**: `core/recording/recorder.go`。SegmentWrittenフックでライブプレイリストをVODへ増分ミラー。`recording_enabled` / `recording_highest_only`(既定ON=最高画質のみ) / `recording_retention_count` / `recording_store_on_s3`。セッションID=`YYYYMMDD-HHMMSS-<乱数8>`（列挙不能）。5秒未満は自動破棄。**オフラインクリップのセグメント（`-offline-`）は録画除外**（`HandleSegmentWritten`と`HandleVariantPlaylist`両方でスキップ。再接続時に混入するとreplay.mp4が壊れるため）
- **【重要】LL-HLS(gohlslib)の録画・サムネはディスクミラーで供給**: gohlslibはライブをRAM配信しディスクに書かないため、録画（ディスク上HLSをミラー）とサムネ生成（最新ディスクセグメントからフレーム取得）が両方切れる。対策=**最高画質を`-c copy`でディスクにも書くffmpeg出力を`llhlsFfmpeg.go diskMirrorOutput`が常時併走**（録画トグルに依存しない＝録画OFFでもサムネ動作、`-c copy`で低CPU、`CleanupOldContent`オンライン掃除で有界）。内部file-writerリスナー(`fileWriterReceiverService.go`、書込前に親dirを`MkdirAll`)経由で従来のSegmentWrittenフローを発火→録画・S3退避・replay.mp4まで従来通り。**LL-HLS時はこのミラーをライブストレージ(S3)へ送らない**（`hlsHandler.go`、RAM配信で不要。オフラインクリップは例外で保存）。ライブ検証済み: finalize→replay.mp4→S3(remoteMedia)まで完全動作
- **アーカイブ**: 確定時にmanifest先行書き→バックグラウンドで remux（`-c copy`→replay.mp4、プレーン`<video>`ネイティブ再生優先。video.js撤去済み）→サイズ記録→S3オフロード（8並列）。**プルーン可能=非公開かつ無制限かつ未購入のみ**（公開/会員/有料/購入実績ありは保護＆保持枠不算入）。3層アクセスは `canViewArchive` が毎リクエスト判定（S3プロキシ経由でも権威維持、Range/206対応）
- **追っかけ再生（ライブDVR）**: 録画が `data/archives/<セッションID>/` に書く**成長中・ENDLISTなしのVODプレイリスト**を `/hls/dvr/` で配信（`controllers/hls.go` の `serveDVR`/`rewriteDVRPlaylist`/`buildDVRMaster`）。プレイリストを`VOD`→**`EVENT`型に書き換え**て「成長しつつ先頭へシーク可能」に。マスターは確定時しか生成されないためオンザフライ合成。**ライブと同一のゲート(`canViewStream`)とトークンdecorateをそのまま再利用**。セグメントは`data/archives/`配下で`CleanupOldContent`の対象外＝全セッションがシーク可能。可用性は `recording.Get().DVRSessionDir()`（録画アクティブ＋セグメント有）→ `status.dvrAvailable`。フロントは**OwncastPlayer内でソース透過切替**（ライブ端=LL-HLS低遅延、シークバーを戻すとDVRソースへ、LIVEボタンで復帰）。PlayerChromeにライブDVRモード（統一シークバー＋LIVEボタン）。**DVRは録画ONの自ホスト配信のみ**（外部ソース時は非提供）
- **外部配信ソース（AWS IVS / IVS互換）**: `models/streamProtocol.go` の `ExternalStreamEnabled`/`ExternalStreamURL`。配信をマネージドサービスへ委譲し、プレイヤーは外部HLS URLを直接再生（自ホストのトランスコードなし）。オンライン判定は `controllers/externalStream.go` のバックグラウンドポーラー（`probeExternalPlaylist`）。この時 `webrtcEnabled=false`・`activeProtocol="external"`・DVR非提供
- **チャットセッションスコープ**: 視聴者向け履歴は「最終配信終了時刻より後」のみ（`persistence.go`、datetime()両側正規化）。クライアントはオフライン90秒後に再取得。モデレーション履歴は全件。DBは2時間プルーナー
- **サイレントモード**: 通知全抑止+未認証には offline偽装。**視聴はadmin(Basic)とモデレーターのみ**（ステータス偽装とHLSゲートは同一述語 `canViewSilentStream`）。有効中の `/api/status` は未認証に offline を返すため、外形監視は認証付きで行うこと

### 購入・決済
- 統合フロー: `controllers/payments.go`（`normalizePurchaseItem`・演出固定価格 `models/donation.go effectPrices`・確定ブロードキャスト10秒遅延）。pendingDonations は mutex+TTL+`ClaimPendingDonation` で二重確定防止
- **サーバー側検証**: Stripe=Webhook署名必須+リダイレクトはsession再取得で`paid`確認 / PayPal=API capture再取得+`COMPLETED`+custom_id / PayPay=署名必須+API再確認 / Metamask=オンチェーン検証（`controllers/metamaskVerify.go`、宛先・金額・成功status・ERC20ログ、fail-closed）/ Ko-fi=トークン定数時間比較+tx-ID冪等。金額は常にプロバイダ側の値。上限100万円/回
- **基準通貨(base currency)**: 設定キー `base_currency`（既定JPY、`core/data/baseCurrency.go`）。暗号資産のfiat換算・スパチャのティア判定・売上集計の基準。各プロバイダは自前の通貨設定を保持（PayPayはJPY固定）。**金額は最小単位で保存**（ゼロ小数通貨=JPY/KRWは主単位、他はマイナー単位。`models/currency.go IsZeroDecimalCurrency`）。管理は「購入・収益」ページの通貨セレクタ
- **アーカイブPPVの通貨**: manifest価格は**自通貨の最小単位で保存済み**。決済時は事前スケール済み金額+通貨オーバーライドで通す（`payments.go` PreScaledAmount/CurrencyOverride）。**主単位前提で `*100` すると100倍過大請求になるので注意**（過去バグ）
- **PayPay環境分離**: `models/paypay.go` `Sandbox*/Production*`+レガシーfallback付き `GetActive*`。他プロバイダも同パターン（PayPal/Stripe）
- **アーカイブ購入**: `donations.archive_id`+`HasPurchasedArchive`（is_test除外）。チャット非配信・Webhook非発火・公開recentフィードから除外（購入者名保護）。管理の手動付与=provider"manual"金額0
- **コインウォレット（プリペイド・台帳ベース）**: `core/data/wallet.go`。**残高は保存せずappend-only `wallet_ledger` の `SUM(delta)` で導出**（監査可能・前払式支払手段の未使用残高報告に対応）。エントリ種別=`charge`/`bonus`/`spend`/`refund`/`admin_adjust`。**1コイン=基準通貨の最小単位**（JPYなら1コイン=¥1）
  - **チャージ**: `item_type="coin"` の購入をStripe/PayPalで通し（`resolveCoinCharge`でログイン必須）、確定時に `creditCoinCharge`→`CreditWalletCharge`（**(provider,payment_id)ユニークindexで冪等**＝webhook/redirect両経路で二重付与なし）。チャット非配信・公開feed除外。ボーナス%は `coin_charge_bonus_percent`
  - **消費**: `POST /api/wallet/spend`（`controllers/walletSpend.go`）で残高からスパチャ/ギフト/PPVを支払い。`SpendWallet` は**mutex直列化のread-check-writeで過剰引き出し不可**。DB書込失敗時は `RefundWallet` で自動返金
  - **【重要】会計（二重計上防止）**: **売上はチャージ時に計上**。コイン払いのdonation行は `payment_provider="coin"` を持ち、売上集計3関数（`GetDonationTotal`/`GetMonthlyDonationTotal`/`GetDonationStats`）が定数 `notTestNotCoinFunded` で**除外**。一方 `amount_jpy` は入れるので**サポーターランキングには反映**され、チャットにも通常表示される
  - API: `GET /api/wallet`（本人の残高+台帳、`RequireUserAccessToken`）/ `/api/admin/wallet/{stats,user,adjust}`。設定 `coin_wallet_enabled`（既定OFF）。**決済作成POSTには `withPaymentAccessToken` でトークン付与が必須**（コイン・PPVのアカウント紐付けをサーバーが解決するため）
- **画面演出（8種）**: `web/components/ui/ScreenEffects/`。**全てCSS描画**（グラデ/clip-path/SVG mask/box-shadow）。emojiは背景が焼き込まれていて透過されず安っぽいため視覚には使わない（pillの小アイコンのみ例外）。粒子数は**価格ティア順に単調増加**（confetti→…→goldrush）で豪華さが金額と一致
- **暗号資産**: マルチチェーン対応。検証は**リクエストの `networkId`（実際に送金したチェーン）**で行う（`metamaskRPCEndpoints`/`evmNativeSymbols`、運営者ウォレットは全EVMチェーン共通）。通貨はチェーンから**サーバー側で導出**（クライアント値は使わない）。伝播/採掘待ちのポーリング（最大~40s）。fiat換算(`amount_jpy`/`fiat_currency`)を記録。VBC(329)はCoinpaprika価格（無料枠60/hのため負のキャッシュ+直近価格フォールバック、`cryptoprice.go`）

### 認証・チャット・ガバナンス
- X OAuth2(PKCE)/Discord/Google/GitHub/IndieAuth/Fediverse: `auth/<provider>/`+`controllers/auth/<provider>/`。GitHubのトークンは数値ID使用（loginはリネーム可能）
- `require_twitter_auth` はレガシー名だが「ソーシャル認証必須」の汎用ゲート（公開configは `GetSocialAuthRequired()` と一致させる）
- **遅延登録**: 匿名ユーザーはページ表示では作らず、初回の参加意図（ログイン開始/チャット送信）時に `ensureRegistered`(zustand)で生成。認証必須モードではログインが唯一の入口。オープンチャットモードのみ従来通り即時登録
- **認証ガバナンス（ソフト削除モデル）**: `auth` は**ハード削除せず失効(`revoked_at`/`revoked_reason`)**。ログイン系ルックアップは全て `revoked_at IS NULL`。1プロバイダー1アクティブ不変条件。**ユーザー自身の解除(`unlinked`)はログイン時に自動復活しない**（乗っ取り防止、`revoked_reason`で判別）、システム失効(`overwritten`/merge)のみ自動復活、運営者は手動復活可（`ReactivateAuth`）。ソーシャルのハンドル名を保存（管理画面・本人の連携表示のみ、**チャット名はランダム名のまま**）。購入保持ユーザーは最後のログイン手段の解除をガード
- **監査ログ**: append-only `auth_events`（`auth/audit.go`、link/unlink/reactivate/overwrite/merge/deleted、actor=self/admin）。統合(`MergeUsers`)は**単一トランザクション**（auth/donations/tokens/messages移動+ソース無効化+マーカー、auth_eventsは移動せず相互参照）。`GetUserAuthDetailsForAdmin` はtoken含む（管理のみ）
- 管理: ユーザーデータ画面(`web/pages/admin/chat/user-data.tsx`)で認証履歴・失効履歴表示、モデレーター付与/解除、手動復活、アカウント統合。API: `/api/admin/chat/users/{auth-events,auth/reactivate,merge,setmoderator}`
- WebSocket: onclose登録+送信バッファ（切断中のチャットは再接続後に自動送信）。チャット入力はslateエディタ。接続情報イベントは本人にのみ連携ハンドルを含む

### ストレージ・バックアップ
- `core/storageproviders/archiveS3.go`: ライブS3設定流用（`Enabled`非依存）、`archives/`・`backups/` プレフィックス。`PrefixUsage`/`DeleteRawPrefix`/multipart管理
- 管理API: `/api/admin/storage/usage`（プレフィックス別内訳）・`/cleanup`（livehls=オフライン時のみ/orphan-archives/multipart）。**配信終了60秒後にhls/自動掃除**（ライブセグメントがバケットに無限蓄積するのを防ぐ）
- バックアップ: `core/backup.go`（`backup_enabled`既定ON/24h/保持7/S3退避オプション）。新ノード移行=`OWNCAST_S3_*` env+`-restoreFromS3`
- 互換性のため内部名は維持: DBファイル `data/owncast.db`、バックアップ接頭辞 `owncast-backup-`、環境変数 `OWNCAST_*`

## セキュリティ対策（詳細は docs/SECURITY.md）

- bcrypt(+SHA-512事前圧縮で72バイト制限回避)、認証レート制限（5回/5分→15分ロック）、`crypto/rand`のstate/PKCE
- **信頼プロキシ検証**（`utils/clientId.go`）: CF-Connecting-IP等は信頼プロキシ経由のみ採用。`OWNCAST_TRUSTED_PROXIES`
- 管理APIのシークレットは GET で `********` マスク・マスク値保存時は既存値維持
- HLS/アーカイブ/WebRTCの全メディア要求にサーバー側ゲート（silent/socialAuth/PPV）。パストラバーサル対策・WS Originチェック・JSON body 15MB上限
- 決済のサンドボックス/テストは `is_test` 記録で売上集計から除外

## データベース

- 主要テーブル: `users`（authenticated_at）/ `auth`（type: x, discord, google, github, twitter, fediverse, indieauth）/ `auth_events`（append-only監査ログ）/ `datastore`（key-value設定）/ `messages`（2時間でプルーン）/ `donations` / `wallet_ledger`（append-onlyコイン台帳）
- **donations拡張列**: `item_type`("superchat"/"effect"/"archive"/**"coin"**=チャージ) / `effect_type` / `is_test` / `amount_jpy`（基準通貨換算値、最小単位）/ `fiat_currency`（換算先通貨、空=JPY）/ `archive_id`（後方互換ALTER、生SQLで読み書き=sqlc再生成回避）。**購入行はアーカイブ削除後も永続**（誰が/いつ/いくら/payment_id）。`payment_provider="coin"` はコイン払い＝**売上集計から除外**（チャージ時に計上済み）
- **wallet_ledger**（`core/data/wallet.go`、生SQLの新規テーブル）: `user_id` / `delta`（コイン、正=付与・負=消費）/ `entry_type`（charge/bonus/spend/refund/admin_adjust）/ `paid_amount`+`paid_currency`（チャージで実際に受領したfiat＝発行価額。ボーナスで膨らむ額面と区別して未使用残高報告に使う）/ `provider`+`payment_id`（チャージの冪等キー、**部分ユニークindex**）/ `ref` / `created_at`。**残高は必ず `SUM(delta)` で導出**（数値保存しない）
- **auth拡張列**: `handle`（ソーシャルのハンドル名）/ `revoked_at`（ソフト削除）/ `revoked_reason`（`unlinked`=ユーザー解除は自動復活しない / `overwritten`=システム失効は復活可）。ログイン系ルックアップは全て `revoked_at IS NULL`（後方互換ALTER）
- **【重要】upstream Owncastのdatastore migration 4（パスワードbcrypt化）は適用禁止**（本フォークは独自適用済み、二重ハッシュでログイン不能になる）
- スキーマは upstream と同一（schemaVersion=7）。DB操作の実例は `docs/database-operations.md`

## 開発の教訓・既知の地雷（重要度順）

1. **依存の壊れ物ピン**: `CAFxX/httpcompression` は **v0.0.8固定**（v0.0.9はContent-Typeを落とし全ページがプレーンテキスト化）。aws-sdk-go-v2 はR2向けにチェックサム `WhenRequired`
2. **antdはminor更新でもSelect内部DOMを変える**（`.ant-select-input`が外枠→内側inputに変化した前例）。テーマ上書きは新旧クラス併記+**スクリーンショット検証必須**（computed styleが正常でも視覚は壊れうる）
3. **プレイヤーはvideo.js撤去済み・全てプレーン`<video>`+共通YouTube風UI**: 3プレイヤー（ライブLL-HLS=`OwncastPlayer`、ライブWebRTC=`WebRTCPlayer`、VOD=`VodPlayer`）は**プレーン`<video>`＋共有オーバーレイ`PlayerChrome`**（自作のシークバー/音量/設定メニュー/全画面/自動フェード）で統一。エンジンはライブHLS/VOD-HLS=**hls.js**、VOD-MP4=ネイティブ、WebRTC=`srcObject`。**video.jsは廃止（依存も削除）**：外部MediaSource/MediaStreamを追跡できずスピナー固着したため。教訓: ①hls.jsのトークンは`xhrSetup`でURL decorate（`/hls/`と`/api/archives/`のみ、外部CDNには付けない）②`<img>`/plain fetchはURL構築時に`withAccessToken`③メディアシーケンス後退クラッシュ回避にffmpeg `-start_number <epoch>` 単調増加は継続 ④コンテナは3つとも厳密16:9（`--player-container-height`から幅上限化。固定高さ+aspect-ratio併用は縦長化して黒帯が出る）⑤設定メニューは項目1種なら歯車で直接リスト展開（中間メニュー省略で1クリック）
4. **自動再生は「音あり」にできない**: ブラウザはユーザー操作前の**unmuted autoplayをブロック**する。音ありで`play()`を試し、拒否されたら**ミュートで自動再生にフォールバック**し「タップして音声をON」を出すのが唯一の解（`OwncastPlayer.attemptPlay`）。ミュートフォールバックを外すと**配信中にトップページを開いても再生が始まらない**（過去バグ）。またポスターの▶とPlayerChromeの中央再生ボタンが同時に出ないよう、**PlayerChromeは`started`後のみマウント**する
5. **管理画面の新規ページは `web/src/routes/admin.tsx` への登録が必須**（file-based routingではない）。未登録だとナビのリンクが別ページに落ちる
6. **画面演出にemojiを使わない**: 🎆/🎇/💰 などの絵文字はグリフに**背景（夜空など）が焼き込まれており透過されない**（映像の上で暗い四角に見える）。全パーティクルはCSS描画（グラデ/clip-path/SVG mask/box-shadow）にする
7. **検証哲学**: HTTP 200チェックはJS実行エラーを検出できない（SPA変更後は実ブラウザ必須）。ビルド/テスト全緑でもレスポンスヘッダ破壊は検出不能（実HTTPで確認）。minifiedで原因不明のReactエラーは**vite devサーバーで実名特定**
8. **切断/接続のステートパスに同期ネットワークI/Oを置かない**（配信終了処理内の同期S3オフロードが全ストリームをデッドロックさせた前例。必ずバックグラウンド化）
9. **CSS**: グローバルbox-sizingリセット無し（width:100%+paddingは静かにあふれる）。`.parent > div` 汎用子セレクタがあるコンテナへの名前付き子追加は詳細度確認。ポータル内antdはConfigProviderが効かない→パネルトークンで明示テーマ
10. **i18n**: 5カタログ完全一致が `npm run check:i18n` で強制（タブインデント、`JSON.stringify(j,null,'\t')+'\n'`）。ユーザー向け文字列は必ず全5カタログ
11. **ffmpeg 5.1.6は `init-%v.mp4` の%vを未展開のまま出力するバグがある**（5.1.8で修正）→該当環境ではLL-HLSブラウザ再生不可。クラシックHLSに切替えるかffmpegを更新
12. **ブラウザのWebアプリマニフェスト取得は同一オリジンでもcredentials省略**→Basic認証等の配下では `crossorigin="use-credentials"` 必須
13. **X APIはFreeプランで `users/me` 不可**（Sign in with Xが403 client-not-enrolled）→Pay Per Useプラン以上が必要
14. S3系ダッシュボードの使用量表示は削除反映にラグがある場合がある（実態確認は ListObjects ベースの `/api/admin/storage/usage` で）
