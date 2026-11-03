# 引き継ぎ書（EVENT MANAGEMENT SYSTEM）

> 最終更新: 2026-11-05 / 実装状況: マスター仕様 PHASE 1〜4 は本番反映済み、PHASE 5 は実装・テスト完了（本番反映は承認待ち）、PHASE 6〜9 は未着手。
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
| `NOTIFICATION_JOB_SECRET` | `/api/jobs/notifications` の認証（Bearer） |
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
- イベント別の役割（`EventRoleAssignment`）: `COLLECTOR`（集金担当）/ `APPROVER`（決裁権者）。PHASE 6 で拡張予定。
- 判定は `src/features/collection/domain.ts` の `decideAccess`（純粋関数・テスト済み）。**画面で隠すだけでなく必ずサーバー側で認可する。**
- 決裁権者が未設定のイベントに限り SUPER_ADMIN が暫定で承認できる（PHASE 6 で見直し）。

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

## 8. 運用手順（LINE・外部サービス）

**LINE Messaging API（LINE Developers コンソール）**
1. Webhook URL: `https://event-management-system-gmpdcasp.vercel.app/api/line/webhook`、「Webhookの利用」ON、「検証」で成功を確認。
2. 応答メッセージはOFF（アプリが返信するため）。
3. 友だち追加→マイページの連携コード（8文字）をトークへ送ると自動連携される。

**LINEログイン（任意）**: 同じプロバイダー配下に「LINEログイン」チャネルを作成し、コールバックURL `https://<本番URL>/api/line/login/callback` を登録、環境変数 `LINE_LOGIN_CHANNEL_ID/SECRET` を設定。

**Googleスプレッドシート出力**: OAuthクライアント（Webアプリ）のリダイレクトURIに `https://developers.google.com/oauthplayground` を追加 → OAuth Playground で `spreadsheets` スコープのリフレッシュトークンを取得 → 環境変数5つを設定。組織ポリシーでサービスアカウントキーが作れないためこの方式。

**通知の定期実行**: `POST /api/jobs/notifications`（`Authorization: Bearer <NOTIFICATION_JOB_SECRET>`）を数分おきに呼ぶ必要がある。**現時点でスケジューラは未設定**（下記）。

**LINE連携の引き継ぎは専用資料 `docs/LINE_HANDOVER.md` を参照**（接続手順・所有権移管・トークン再発行・トラブルシュート）。本番の接続状態は管理画面 `/line-status`（SUPER_ADMIN）で診断できる。

## 9. 未完了・要対応

- [ ] **通知の定期実行が動いていない**（本番DBで期限超過の PENDING ジョブあり）。古い通知を送らないガード（開催済み・12時間以上遅れた時間依存通知は取消）は実装済み（未デプロイ）。定期実行の仕組み（`POST /api/jobs/notifications` を数分おきに呼ぶ。Vercel Cron は GET のため別途対応が必要）は未設定。
- [ ] 実際のLINEでの友だち追加→自動連携の動作確認（PHASE 3 は実LINEで未確認）。
- [ ] Google スプレッドシート出力の環境変数設定と動作確認。
- [ ] 決裁権者のアカウント決定（PHASE 6）。
- [ ] PHASE 6 以降: 非公開帳簿（決裁権者のみ・SUPER_ADMINも不可）、決裁権者の指定・変更フロー、役割変更、報告書（集金/参加者）、PDF、LINE共有。
- [ ] 店舗支払の「支払予定の取消」は未実装（誤登録は PHASE 6 の訂正フローで対応予定）。
- [ ] 本番画面の通し確認（管理者ログインでの目視）。これまでの検証は実DB統合テストとローカル画面確認が中心。

## 10. 既知の注意点

- 金額は円の整数。日時は常に JST（`src/lib/jst.ts`）。単純な+9時間処理は禁止。
- `"use server"` ファイルから export した関数は外部から呼べるエンドポイントになる。ヘルパーは別ファイルに置く。
- 譲渡・配布・入金はトランザクションと楽観ロック/Serializable で二重処理を防いでいる。変更時はこの前提を崩さない。
- 作業の経緯と判断は `git log` と各PHASEのコミットメッセージにある。
