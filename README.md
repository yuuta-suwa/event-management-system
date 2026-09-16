# EVENT MANAGEMENT SYSTEM

チケット確保 → 集客 → 入金 → 実来場を、イベント・スタッフ・年間単位で追跡する運営管理システムです。

## 現在の状態

PHASE 1〜13を実装済みです。

- Next.js 16 / TypeScript / App Router
- PostgreSQL / Prismaの全体データモデル
- Auth.js暗号化JWTセッション、メール・パスワード認証
- 4ロールのRBACとイベント担当範囲判定
- 管理ダッシュボードの基本レイアウト
- Web App Manifest / Service Worker / インストール可能なPWA基盤
- RBAC単体テスト
- イベント一覧・作成・編集・詳細
- カテゴリー選択、日時整合性検証、イベント操作の監査ログ
- スタッフ登録、チケット割当、残枚数、スタッフ別KPI
- スタッフ専用申込URL・QRコード
- Web参加申込、紹介スタッフ自動記録、定員・割当残数チェック
- 参加者マスター、イベント参加履歴、参加者名簿・横断検索
- 銀行振込の手動確認、5つの入金ステータス、確認履歴・監査ログ
- スーパー管理者限定の入金金額・入金済合計表示
- 入金後の電子チケット有効化、署名付きQRトークン、DBハッシュ照合
- QR改ざん検知、世代管理、個人情報を含まない電子チケット表示
- スマートフォンカメラQR受付、二重受付防止、イベント照合
- 未入金警告、現地支払・受付拒否・管理者確認、当日参加登録
- チケット名義変更、譲渡可否判定、旧QRの即時失効、新QR世代発行
- 入金状態を維持する譲渡トランザクション、譲渡履歴・監査ログ
- LINE連携、申込・振込・未入金・入金完了・チケット・前日・3時間前通知
- イベント分析、年間推移、スタッフランキング、スーパー管理者限定売上
- 参加者・入金・受付・スタッフ実績CSV
- レート制限、セキュリティヘッダー、停止ユーザー再検証、担当イベント認可

ローカルデモ認証中は代表イベントを表示し、作成・編集操作は本番DBへ保存しません。本番DB接続時はPrisma経由で永続化されます。本番公開前は [本番公開チェックリスト](docs/PRODUCTION_CHECKLIST.md)、[運用ランブック](docs/RUNBOOK.md)、[最終テスト計画](docs/TEST_PLAN.md) を確認してください。

## ローカルセットアップ

必要環境: Node.js 22以上、pnpm、PostgreSQL 15以上。

1. `.env.example` を `.env` にコピーし、DB URL、32文字以上の `AUTH_SECRET`、初期管理者情報を設定します。
2. `pnpm install`
3. `pnpm db:generate`
4. `pnpm db:migrate`
5. `pnpm db:seed`
6. `pnpm dev`

DBを用意せず画面だけを確認する場合は、ローカル実行時のみ `ENABLE_LOCAL_DEMO_AUTH=true` とデモ用メール・パスワードを設定できます。本番ではこのフラグを有効にしないでください。

## セキュリティ

パスワードはbcrypt（cost 12）でハッシュ化し、認可はサーバー側で検証します。本番ではHTTPS、強固な `AUTH_SECRET`、DB接続のTLS、IP/ユーザー単位のレート制限、秘密情報ストアが必須です。QRトークンの生値は発行時のみ扱い、DBにはハッシュだけを保存する設計です。

## LINE設定（PHASE 9）

LINE DevelopersでMessaging API Channelを作成し、Webhook URLを登録します。秘密情報は `.env` の `LINE_CHANNEL_SECRET`、`LINE_MESSAGING_ACCESS_TOKEN` に設定します。Webhookは署名検証し、通知ジョブは `NOTIFICATION_JOB_SECRET` で保護されたAPIから実行します。

## デプロイ方針

VercelへNext.jsアプリを接続し、マネージドPostgreSQLを用意します。環境変数を登録後、デプロイ前に `prisma migrate deploy` を実行します。通知ジョブはVercel Cronまたは専用ワーカーから保護されたジョブAPIを起動する構成にします。

## テスト

- `pnpm test`: Unit test
- `pnpm lint`: ESLint
- `pnpm build`: 本番ビルド

重点テスト（入金、QR、譲渡、権限、売上、LINE、CSV、レート制限）を実装済みです。実機・ステージング確認項目は [docs/TEST_PLAN.md](docs/TEST_PLAN.md) を参照してください。

詳細な設計判断は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を参照してください。

## イベント告知LP（LINKS BAR EVENT LP）

Instagram / LINEから開く、スマートフォン特化のイベント告知ページです。`/event` で公開されます。イベント管理システム本体とは別の役割（申込・チケット発行はしない）で、CTAから既存の申込ページ（`/apply/[eventId]`）へ遷移します。

イベントごとに新しいページは作らず、この1ページを毎回更新して使い回します。

### 次回イベント更新方法

1. [src/data/eventConfig.ts](src/data/eventConfig.ts) の値を書き換える（日付・時間・会場・住所・料金・定員・申込URL・コピーなど）
2. 実写真がある場合は `public/images/event/` に配置し、`eventConfig.heroImage` にパスを設定する（未設定の場合は現状のCSSのみの演出のまま使用される）
3. OGP画像は [src/app/event/opengraph-image.tsx](src/app/event/opengraph-image.tsx) が `eventConfig` の値から自動生成するため、通常は変更不要（英字のみ表示。日本語を含めたい場合はフォント埋め込みが必要になるため要相談）
4. コピー文言（見出し・本文）を必要に応じて変更する
5. `pnpm db:generate && pnpm build` で本番ビルドを確認
6. Vercelへdeploy

### EVENT UPDATE CHECKLIST

- [ ] イベント名
- [ ] 日付
- [ ] 曜日
- [ ] 開催時間
- [ ] 会場
- [ ] 階数
- [ ] 住所
- [ ] 料金
- [ ] 料金内容
- [ ] 定員
- [ ] 申込URL（`eventConfig.applicationUrl`）
- [ ] MAP URL（`eventConfig.mapUrl`、未設定なら「MAPを見る」は非表示）
- [ ] Hero画像（任意）
- [ ] メインコピー

### データ整合性について

以下3箇所のイベント情報は本来一致している必要があります。

1. LINKS EVENT LP（`/event`、本セクションの設定ファイル）
2. イベント管理システムの申込画面（`/apply/[eventId]`、管理画面でイベントを編集して設定）
3. 申込後の電子チケット

LPリポジトリ（本リポジトリ）から申込画面・電子チケットのデータを直接は変更していません。イベント作成・編集画面（`/events/[id]/edit`）側で日時・会場・住所・料金・定員を今回の内容と一致させてください。また、同画面の「告知ページURL（任意）」に本LPのURL（例: `https://event-management-system-gmpdcasp.vercel.app/event`）を設定すると、申込画面から本LPへ戻れるようになります。
