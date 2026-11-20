# 本番公開チェックリスト

## 必須環境

- Node.js 22以上、PostgreSQL 15以上を用意する。
- `.env.example` の全項目を本番の秘密情報ストアへ登録する。
- `AUTH_SECRET`、`QR_TOKEN_SECRET`、`NOTIFICATION_JOB_SECRET` は独立した32バイト以上のランダム値にする。
- `ENABLE_LOCAL_DEMO_AUTH=false` とし、`LOCAL_DEMO_PASSWORD` は本番に登録しない。
- `NEXT_PUBLIC_APP_URL` はHTTPSの本番URL、`DATABASE_URL` はTLS必須の専用DBユーザーにする。

## データベース

1. 本番DBのスナップショットを取得する。
2. `pnpm install --frozen-lockfile`、`pnpm db:generate` を実行する。
3. `pnpm prisma migrate deploy` を実行する。
4. 初回だけ `pnpm db:seed` を実行し、初期管理者のパスワードを直ちに変更する。
5. 最新Migration、管理者状態、イベント件数を確認する。

バックアップは日次、保持期間30日以上、月1回の復元訓練を推奨する。DBとバックアップは同一障害ドメインに置かない。

## LINE

- Webhook URLを `https://本番ドメイン/api/line/webhook` に設定する。
- `LINE_CHANNEL_SECRET` と `LINE_MESSAGING_ACCESS_TOKEN` を登録する。
- 通知ジョブを5分間隔で `POST /api/jobs/notifications` に実行し、`Authorization: Bearer <NOTIFICATION_JOB_SECRET>` を付ける。
- 不正Webhook署名が401になることを確認する。
- テスト参加者で申込、振込案内、未入金、入金完了、チケット、前日、3時間前通知を確認する。

## 公開前ゲート

- `pnpm lint`、`pnpm test`、`pnpm build --webpack` が成功する。
- `docs/TEST_PLAN.md` の権限マトリクスをステージングで実施する。
- iPhone SafariとAndroid Chromeで申込、電子チケット、カメラ受付、当日参加を確認する。
- 売上画面・金額入りCSVがSUPER_ADMIN以外で拒否されることを確認する。
- 同一QRを同時に2台で読み取り、片方だけ成功することを確認する。
- 譲渡後の旧QRが無効、新QRが有効、入金状態が維持されることを確認する。
- CSVの日本語、改行、先頭ゼロ、数式注入対策をExcelで確認する。
- HTTPS、HSTS、CSP、フレーム拒否、MIME sniffing拒否を確認する。

## 公開とロールバック

1. DBバックアップ後にMigrationを適用し、アプリをデプロイする。
2. `/login`、`/dashboard`、公開申込URL、通知ジョブAPIをスモークテストする。
3. 重大障害時は直前のアプリ版へ戻す。DB復元が必要なら新DBへ復元して接続先を切り替える。
4. 公開後24時間はログイン失敗、通知失敗、受付エラー、DB接続数を監視する。

## 6.0 リリース（2026-11-06 追加）

詳細な手順は [RELEASE_6_0.md](RELEASE_6_0.md)。公開前に次をすべて確認する。

- [ ] 本番DBのバックアップ（Neonのブランチ／復元ポイント）を作成した
- [ ] `prisma migrate deploy` で `20261105100000` と `20261106100000` を適用し、`migrate status` が最新
- [ ] Vercel の Production Branch が `main` であることを確認した（GitHubの既定ブランチは `production-release` のまま）
- [ ] 通知の定期実行を設定した（[SCHEDULER.md](SCHEDULER.md)）／`/api/jobs/notifications` が未認証で 401
- [ ] `RESEND_API_KEY` `EMAIL_FROM` を設定し、ドメインが認証済み。自分宛てのテスト送信で本文・QR画像・受付コードを確認した（[EMAIL_SETUP.md](EMAIL_SETUP.md)）
- [ ] LINEログインチャネルを作成し、`LINE_LOGIN_CHANNEL_ID/SECRET` を設定した。実機で「LINEで登録・連携する」→友だち追加→通知可能を確認した（[LINE_HANDOVER.md](LINE_HANDOVER.md)）
- [ ] 各イベントの決裁権者を指定した。決裁権者以外（SUPER_ADMIN含む）から `/ledger`・収支が見えないことを確認した
- [ ] 受付: QR・受付コード・参加者検索の3方式で受付できる。iPhone Safari・Android Chrome で連続受付を実測した（[CHECKIN_PERFORMANCE.md](CHECKIN_PERFORMANCE.md)）
- [ ] 報告: 下書き→提出→別ユーザーで承認ができ、印刷ページからPDF保存できる
- [ ] イベント日時の表示が日本時間になっている
- [ ] 秘密情報の再発行（Neon の DB パスワード、Google OAuth クライアントシークレット。過去にチャットへ貼られた）
