# PHASE 3〜13 完了監査

| PHASE | 要件 | 実装・証跡 |
|---|---|---|
| 3 | スタッフ、割当、残数、専用URL/QR、KPI | `/staff`、`/events/[id]/allocations`、割当トランザクション、紹介コード、KPIテスト |
| 4 | 申込、参加者マスター、紹介者、名簿、検索 | `/apply/[eventId]`、`/participants`、重複参加者統合、定員・割当チェック、出欠・欠席管理 |
| 5 | 5入金状態、確認履歴 | `/payments`、Payment履歴、確認者・日時、状態遷移テスト |
| 6 | 電子チケット、QR、トークン、セキュリティ | `/ticket/[token]`、署名・ハッシュ・世代照合、個人情報非格納、改ざんテスト |
| 7 | カメラ受付、二重防止、未入金、当日参加 | `/checkin`、UNIQUE制約＋Serializable、3分岐、担当イベント認可 |
| 8 | 譲渡、旧QR失効、新QR、履歴 | `/transfers`、QR世代更新、入金状態維持、TicketTransfer・AuditLog |
| 9 | LINE連携、7通知、履歴 | `/notifications`、Messaging API、署名Webhook、再試行ジョブ、成功・失敗ログ |
| 10 | 分析、4指標、年間推移、ランキング | `/analytics`、イベント別集計、月別推移、スタッフランキング、指標テスト |
| 11 | イベント・年間売上、限定アクセス | `/sales`、SUPER_ADMINサーバー認可、金額非表示、売上テスト |
| 12 | 4種CSV | `/exports`、参加者・入金・受付・スタッフ実績、BOM・数式注入対策 |
| 13 | QA・セキュリティ・スマホ | 45自動テスト、レスポンスヘッダー、レート制限、停止ユーザー再検証、レスポンシブCSS、運用3文書 |

## 最終機械検証

- ESLint: 成功
- Vitest: 13ファイル、45テスト成功
- Next.js production build: 成功、22ページ生成
- Production server smoke test: ログイン、参加者、譲渡、通知、分析、売上、CSVが200
- 保護API: 未認証CSV 401、不正通知ジョブ 401、不正LINE署名 401
- セキュリティヘッダー: CSP、HSTS、X-Frame-Options、Permissions-Policy、nosniffを確認

## 本番環境でのみ実施する確認

実LINEアカウントへの配信、実PostgreSQLへのMigration、iPhone/Android実機、同時2端末受付、バックアップ復元は外部環境が必要なため、`PRODUCTION_CHECKLIST.md` の公開ゲートとして実施する。
