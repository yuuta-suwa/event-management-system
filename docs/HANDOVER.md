# 引き継ぎ書（EVENT MANAGEMENT SYSTEM）

> 最終更新: 2026-11-06 / 実装状況: 5.4 PHASE 1〜4 は本番反映済み。PHASE 5 と 6.0 の WORKSTREAM A〜I は**2026-11-13 に本番へ反映済み**（マイグレーション2件適用、`main` を push、Vercel READY）。反映の記録と手順は [docs/RELEASE_6_0.md](RELEASE_6_0.md)。残りは管理者の設定作業（決裁権者の指定、LINEログイン、メール、実機での受付速度の実測。通知の定期実行は当面なしの方針）。
> この文書は各PHASE完了時に更新する。**秘密情報（パスワード・トークン・接続文字列）は絶対に書かない。**

## 1. 概要と場所

| 項目 | 内容 |
|---|---|
| 本番URL | https://event-management-system-gmpdcasp.vercel.app |
| ソース | https://github.com/yuuta-suwa/event-management-system （`main` へ push すると Vercel が自動デプロイ） |
| 技術 | Next.js 16（App Router）/ TypeScript / Prisma 6 / PostgreSQL（Neon）/ Vercel |
| 注意 | Next.js のこのバージョンは破壊的変更がある。コードを書く前に `node_modules/next/dist/docs/` を確認する（AGENTS.md 参照）。 |
| 既存資料 | `docs/ARCHITECTURE.md` `RUNBOOK.md`（日次運用・障害対応）`PRODUCTION_CHECKLIST.md` `TEST_PLAN.md` `COMPLETION_AUDIT.md` |

## 2. 引き継ぎ時に最初にやること

1. GitHub リポジトリ、Vercel プロジェクト、Neon プロジェクト、LINE Developers、Google Cloud の各コンソールに、新担当者のアカウントを招待する（アカウント共有はしない）。
2. **シークレットの再発行**: 開発中に次の値がチャットへ貼られている。引き継ぎ前に必ず再発行し、Vercel の環境変数を更新する。
   - Neon の DB パスワード（Neon の Roles でリセット → `DATABASE_URL` 更新）
   - Google OAuth クライアントのシークレット（使わないなら削除）
3. 本番の管理者アカウント（SUPER_ADMIN）を新担当者用に作成し、旧担当者のアカウントは `status` を `SUSPENDED` にする。
4. 下記「9. 未完了・要対応」を確認する。

## 3. 環境変数（名前のみ。値は Vercel の Environment Variables）

| 名前 | 用途 |
|---|---|
| `DATABASE_URL` | Neon の接続文字列 |
| `AUTH_SECRET` / `AUTH_TRUST_HOST` | ログイン（NextAuth）。`AUTH_SECRET` 変更で全セッション失効 |
| `QR_TOKEN_SECRET`（32文字以上） | QRチケット・マイページ・配布リンク・LINEログイン state の署名。**変更すると既存の全リンクが無効になる** |
| `NEXT_PUBLIC_APP_URL` | 本番URL（LINE通知・配布リンクの生成に使用） |
| `LINE_CHANNEL_ID` `LINE_CHANNEL_SECRET` `LINE_MESSAGING_ACCESS_TOKEN` | LINE Messaging API（通知・Webhook署名検証） |
| `NEXT_PUBLIC_LINE_BASIC_ID` | 公式アカウントのベーシックID（@の後ろ）。マイページの友だち追加ボタン用 |
| `LINE_LOGIN_CHANNEL_ID` `LINE_LOGIN_CHANNEL_SECRET` | 任意。LINEログインによる本人確認連携 |
| `NOTIFICATION_JOB_SECRET` | `/api/jobs/notifications` の認証（Bearer）。POST（外部スケジューラ）・GET（Vercel Cron）の両方で使える。16文字以上 |
| `CRON_SECRET` | 任意。Vercel Cron を使う場合、Vercel が自動で付ける Bearer 値（`NOTIFICATION_JOB_SECRET` と同じ値でもよい） |
| `RESEND_API_KEY` `EMAIL_FROM` | メール配信（QRチケット）。未設定の間は送信せず履歴に「送信しない」と記録。詳細 [docs/EMAIL_SETUP.md](EMAIL_SETUP.md) |
| `EMAIL_REPLY_TO` `CONTACT_EMAIL` | 任意。返信先と、メール本文の「お問い合わせ先」 |
| `GOOGLE_SHEETS_CLIENT_ID` `_CLIENT_SECRET` `_REFRESH_TOKEN` `_SPREADSHEET_ID` `_SHEET_NAME` | 任意。`/sales` のスプレッドシート出力 |
| `BLOB_READ_WRITE_TOKEN` | チケット背景画像の保存（Vercel Blob） |
| `ENABLE_LOCAL_DEMO_AUTH` | **本番では必ず false/未設定** |

## 4. デプロイとデータベース

- デプロイ: `git push origin main` → Vercel が自動ビルド（約3〜4分）。ビルドは `prisma generate && next build`。
- **マイグレーションは自動適用されない。** コードより先に本番DBへ適用する（コードが新しい列・表を使うため）。
  ```bash
  DATABASE_URL="<本番URL>" npx prisma migrate status   # 保留中を確認
  DATABASE_URL="<本番URL>" npx prisma migrate deploy   # 適用
  ```
- 禁止: `prisma migrate reset` / `DROP DATABASE` / `TRUNCATE` / 既存データの一括削除。マイグレーションは追加のみとし、金銭系テーブルの外部キーは `RESTRICT`（物理削除させない）。
- 新しいマイグレーションを作る手順: スキーマを編集 → 空のDBに全マイグレーションを適用 → `prisma migrate diff --from-url <DB> --to-schema-datamodel prisma/schema.prisma --script` で SQL を生成 → ドリフトなしを確認。

## 5. テスト

- 単体: `npx vitest run`（DB不要）。型: `npx tsc --noEmit`。静的検査: `npx eslint src tests`。ビルド: `npx next build --webpack`。
- **実DB統合テスト**（`tests/integration/*`）は `TEST_DATABASE_URL` が localhost のときだけ動く。本番DBでは絶対に動かさない。
  ```bash
  mkdir -p /tmp/pgtest && cd /tmp/pgtest && npm i embedded-postgres
  # start.mjs: new EmbeddedPostgres({databaseDir:"/tmp/pgtest/data",user:"test",password:"test",port:54329,persistent:false})
  #            → initialise() / start() / createDatabase("eventtest")
  cd <repo> && DATABASE_URL=postgresql://test:test@localhost:54329/eventtest npx prisma migrate deploy
  TEST_DATABASE_URL=postgresql://test:test@localhost:54329/eventtest npx vitest run
  ```
- 重要な防御（二重受取・乗っ取り・超過入金・経費二重計上など）は、わざと壊すとテストが落ちることを確認済み。新しい防御を足したら同じ確認をする。
- 画面確認は、ローカルで `.env.local`（テストDB向け・git管理外）を作って `npm run dev`、テスト用ユーザーでログインして行う。終わったら `.env.local` を削除する。

## 6. 権限と役割

- 全体ロール（`UserRole`）: `SUPER_ADMIN` / `EVENT_MANAGER` / `RECEPTION_STAFF` / `PARTICIPANT`。
- イベント別の役割（`EventRoleAssignment`）: `COLLECTOR`（集金担当）/ `APPROVER`（決裁権者）/ `REPORTER`（報告担当。参加者報告を作成できる）。
- 判定は `src/features/collection/domain.ts` の `decideAccess`（純粋関数・テスト済み）。**画面で隠すだけでなく必ずサーバー側で認可する。**
- 決裁権者が未設定のイベントに限り SUPER_ADMIN が暫定で承認できる（金銭操作のみ。**非公開帳簿は含まれない**）。非公開帳簿の閲覧は `canViewLedger`（`src/features/ledger/access.ts`）で明示的な決裁権者本人に限る。

## 7. 機能と画面（実装済み）

| 領域 | 画面/場所 | 要点 |
|---|---|---|
| イベント | `/events` | 作成・編集・公開、通知スケジュール設定（JST）、経費 `/events/[id]/expenses`、収支 `/sales`（SUPER_ADMIN） |
| 申込・購入 | `/apply/[eventId]` | 複数枚購入、参加者マイページ `/my/[token]` |
| 配布・譲渡 | マイページ、`/claim/[token]` | 有効期限7日・取消可の共有リンク（`shr1`）。承認後でも配布・譲渡可。譲渡で旧QR失効、旧保有者の登録は切り離し。履歴は `TicketTransfer` |
| QR | `/ticket/[token]` `/checkin` | イベント詳細つきQR、二重受付防止、当日参加 |
| LINE | `/notifications`、Webhook `/api/line/webhook` | follow/unfollow検知、重複Webhook防止、連携コード照合、乗っ取り防止、LINEログイン（任意）、仮登録一覧 |
| 集金 | `/collection` | 担当者別、分割入金、全額で自動入金確認（QR有効化）、預り金残高 |
| 立替 | `/advances` | 参加費立替と回収、経費立替の申請→確認→承認→精算（承認時に経費を1回だけ計上） |
| 送金・照合 | `/remittances` | 集金担当→決裁権者への送金。送金予定→送金済み報告→受領確認。金額が違えば差異あり（理由必須）→送金側が訂正して照合完了。送金は預り金だけを減らし、売上・経費には影響しない |
| 店舗支払 | `/store-payments`（決裁権者のみ） | 支払先ごとに予定額・分割支払・未払残高。経費は登録時に1回だけ計上（既存経費への紐づけ可、立替由来の経費は紐づけ不可）。支払記録は取消のみ（物理削除なし） |
| 出力 | `/exports`、`/sales` | CSV、Googleスプレッドシート出力 |
| 受付（6.0） | `/checkin` | **QR読取／受付コード／参加者検索の3方式**。共通処理 `finalizeCheckin`（`src/features/checkins/service.ts`）。二重受付は `Checkin.ticketId` の一意制約で保証。受付コードはイベント内一意の6桁、譲渡で失効、失敗15回/10分でロック。検索受付は同姓同名のとき電話番号下4桁か身分証での確認が必須。画面に p50/p95 を表示 |
| LINE連携（6.0） | マイページ | **標準はLINEログイン（8文字コード不要）**。友だち状態を友だち確認APIで取得。LINEログイン成功だけでは通知可能にならず、友だち追加（follow）で通知可能になる。コード方式は代替として残す |
| メール（6.0） | `/emails` | 入金確認→QR有効化メール、申込受付メール、譲渡受取メール。受取人が未定のチケットには送らない。送信直前に保有者・失効・入金を再確認。再送は24時間3回まで。履歴・失敗・再試行 |
| 決裁権者（6.0） | `/events/[id]/approver` | 指定・変更フロー（現決裁権者の承認＋新決裁権者の承諾。自己昇格禁止。緊急時は新決裁権者の承諾＋SUPER_ADMIN2名） |
| 非公開帳簿（6.0） | `/ledger`, `/api/ledger/csv` | **そのイベントの決裁権者本人のみ**（SUPER_ADMINも不可）。決裁権者が指定されたイベントの収支は、`/sales`・経費管理・スプレッドシート出力・支払CSVの金額からも決裁権者以外には出ない |
| 報告（6.0） | `/reports` | 集金状況／参加者／統合の3種。下書き→提出（提出時点のスナップショット固定）→確認→承認/差戻し→新版で再提出。LINE用報告文（参加予定者数・実参加者数・参加者名［実参加者は受付時刻つき、未受付/欠席は別枠］を既定で含む。電話番号・メールは含まない。「氏名を含めない」で集計のみにも切替可）、期限付き閲覧リンク、A4印刷用ページ（ブラウザの「PDFとして保存」） |
| 店舗支払の取消・訂正（6.0） | `/store-payments` | 予定の訂正（監査ログに前後を保存）と取消（支払記録を先に取消。登録時に新規計上した経費のみ連動して無効化。物理削除なし） |

## 8. 運用手順（LINE・外部サービス）

**LINE Messaging API（LINE Developers コンソール）**
1. Webhook URL: `https://event-management-system-gmpdcasp.vercel.app/api/line/webhook`、「Webhookの利用」ON、「検証」で成功を確認。
2. 応答メッセージはOFF（アプリが返信するため）。
3. 友だち追加→マイページの連携コード（8文字）をトークへ送ると自動連携される。

**LINEログイン（任意）**: 同じプロバイダー配下に「LINEログイン」チャネルを作成し、コールバックURL `https://<本番URL>/api/line/login/callback` を登録、環境変数 `LINE_LOGIN_CHANNEL_ID/SECRET` を設定。

**Googleスプレッドシート出力**: OAuthクライアント（Webアプリ）のリダイレクトURIに `https://developers.google.com/oauthplayground` を追加 → OAuth Playground で `spreadsheets` スコープのリフレッシュトークンを取得 → 環境変数5つを設定。組織ポリシーでサービスアカウントキーが作れないためこの方式。

**通知の定期実行**: `POST /api/jobs/notifications`（`Authorization: Bearer <NOTIFICATION_JOB_SECRET>`）を数分おきに呼ぶ必要がある。**現時点でスケジューラは未設定**（下記）。

**LINE連携の引き継ぎは専用資料 `docs/LINE_HANDOVER.md` を参照**（接続手順・所有権移管・トークン再発行・トラブルシュート）。本番の接続状態は管理画面 `/line-status`（SUPER_ADMIN）で診断できる。

## 9. 未完了・要対応（2026-11-06 時点）

### 開発状況（6.0 WORKSTREAM）

| | 実装 | テスト | 本番反映 | 未完了・注意 |
|---|---|---|---|---|
| A 購入後の配布・譲渡 | 済（PHASE 2、既に本番） | 実DB 13件 | 済 | 「購入申込中」の配布予約の専用画面は未実装 |
| B LINE連携の簡素化 | 済 | 実DB（友だち未追加/既存/ブロック/二重連携） | **未** | LINEログインチャネルの作成・環境変数設定は管理者作業。実機のLINE未確認 |
| C メール配信 | 済 | 実DB 7件（外部送信はモック） | **未** | 送信サービス契約・ドメインDNS・環境変数は管理者作業。実送信未確認。メールアドレスの所有確認フローは未実装 |
| D 受付方式 | 済 | 実DB 9件 | **未** | |
| E 受付の高速化 | 済（実装） | サーバー処理の実測のみ | **未** | **iPhone/Android実機での1秒以内の実測は未実施**。[docs/CHECKIN_PERFORMANCE.md](CHECKIN_PERFORMANCE.md) |
| F 集金・立替・送金・店舗支払 | 済（PHASE 4・5＋取消/訂正） | 実DB 11件ほか | PHASE 4は済。PHASE 5＋取消/訂正は**未** | |
| G 決裁・帳簿 | 済 | 実DB 7件＋単体 | **未** | 決裁権者アカウントの決定と指定は管理者作業 |
| H 報告・PDF・LINE共有 | 済 | 実DB 6件＋単体 | **未** | PDFはブラウザ印刷（サーバー生成の.pdfではない）。LINEへの自動投稿はしない（共有ボタンで送信先をLINE側で選ぶ） |
| I 通知スケジューラ | 済（GET対応・古い通知のガード・JST回帰） | 単体＋実DB | **未** | **定期実行そのものは未設定**。[docs/SCHEDULER.md](SCHEDULER.md) |

### 管理者が行う操作（順番）

[docs/RELEASE_6_0.md](RELEASE_6_0.md) の「本番反映の手順」「管理者の設定作業」を参照。

### 既知の注意点・未検証

- [ ] 実LINEでの通しの動作確認（LINEログイン→友だち追加→通知可能）。未実施。
- [ ] iPhone Safari / Android Chrome での受付速度の実測。未実施。
- [ ] Google スプレッドシート出力の環境変数設定と動作確認。
- [ ] 本番画面の管理者ログインでの目視確認（ローカルDBでは確認済み: 受付3方式・マイページ・報告・帳簿の拒否・売上画面の非公開イベント除外）。
- [ ] 日時表示: 全ページに `timeZone: Asia/Tokyo` を明示した。本番サーバーがUTCの場合は表示が変わる（正しくなる）ため、反映後にイベント日時の表示を確認する。
- [ ] 決裁権者が未設定の間は、SUPER_ADMINが送金受領・立替承認・店舗支払を暫定で行える（従来仕様）。非公開帳簿は決裁権者が指定されるまで誰も閲覧できない。
- [ ] `origin/HEAD`（GitHubの既定ブランチ）は `production-release`（古いブランチ）で、実際の本番デプロイは `main` への push で動いている。Vercel の Production Branch 設定を確認し、既定ブランチ（GitHub Actions の定期実行は既定ブランチでのみ動く）を `main` にするか決める。

## 10. 既知の注意点

- 金額は円の整数。日時は常に JST（`src/lib/jst.ts`）。単純な+9時間処理は禁止。
- `"use server"` ファイルから export した関数は外部から呼べるエンドポイントになる。ヘルパーは別ファイルに置く。
- 譲渡・配布・入金はトランザクションと楽観ロック/Serializable で二重処理を防いでいる。変更時はこの前提を崩さない。
- 作業の経緯と判断は `git log` と各PHASEのコミットメッセージにある。
