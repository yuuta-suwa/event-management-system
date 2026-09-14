# システムアーキテクチャ

## 構成

- `src/app`: App Router、画面、Route Handlers、Server Actions
- `src/features`: 今後追加するイベント・チケット・参加者・入金・受付・分析の業務モジュール
- `src/server`: Prisma、認証、RBAC、監査、外部連携
- `prisma`: PostgreSQL Schema、Migration、Seed
- `tests`: Unit、Integration、E2E

ブラウザからNext.jsへHTTPS接続し、認証と認可を通したServer Action/Route HandlerだけがPrisma経由でPostgreSQLへアクセスする。LINE webhookは署名検証後にジョブを登録し、通知処理は再試行可能な非同期ジョブとして実装する。QRには生トークンだけを入れ、DBにはハッシュだけを保持する。

## 主要判断

- Auth.jsの署名・暗号化JWTセッションを利用する。Credentials Providerの制約に合わせ、12時間で失効させる。重要操作ではユーザー状態をDBで再検証し、停止済みユーザーを拒否する。
- 金額は浮動小数ではなく円単位の整数で保存する。
- 売上アクセスはUIとAPIの両方で `revenue:read` を検査する。
- 二重受付は `Checkin.ticketId` のUNIQUE制約とDBトランザクションで防ぐ。
- 参加者はマスター、イベント参加は登録テーブルに分離し、複数回参加履歴を保持する。
- PostgreSQLを本番の正とするため、ホスティング固有SQLiteへ置換しない。
