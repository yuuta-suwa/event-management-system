# LIFE STAGE COMMON CORE

LIFE STAGE APP01（THE FINAL DISCOVERY）・APP02（SELF-REALIZATION ENGINE）・APP03（MAKE IT REAL）共通の
**招待制 認証・アクセス権・データベース基盤**です。

> このディレクトリは独立したプロジェクトです。親ディレクトリの「イベント管理システム」とはコード・依存関係・ビルドを共有しません。

## 状態（2026-11-18）
- Phase 0〜5 をローカル環境で実装・検証済み（自動テスト 84 件合格）。
- Supabase 開発プロジェクト・Vercel STG は**未構築（発注者承認待ち）**。Google ログインと管理画面の実環境確認、5名試験運用は未実施。
- 詳細：[docs/PROGRESS.md](docs/PROGRESS.md)、依頼・未決事項：[docs/TODO.md](docs/TODO.md)

## 技術構成
Next.js 16（App Router, `proxy.ts`）／TypeScript／Supabase Auth（Google OAuth・MFA TOTP）／Supabase PostgreSQL（RLS）／Supabase Storage（非公開）／Vercel。有料 AI API は使用しません。

## セキュリティの要点
- Google 認証に成功しても、**招待を受諾するまで利用不可**（profile 自体が存在しない）。
- 権限判定は**すべて DB の現在状態**。JWT のメタデータは使わない。停止は既存セッションにも即時反映。
- テーブルへの直接書き込みは禁止。書き込みは権限確認・MFA・監査記録を内蔵した RPC のみ。
- アプリは publishable key のみ使用（secret / service_role キーは不使用）。
- 管理者も利用者の個人データ（人生設計等）は閲覧できない。

## セットアップ（ローカル）
必要：Node.js 22+、pnpm、PostgreSQL 15+（ローカル検証用）

```bash
cd life-stage-core
pnpm install
pnpm db:local:start   # ローカルDB（Supabase互換シム＋マイグレーション）
pnpm test             # 単体＋実DBセキュリティテスト
cp .env.example .env.local   # Supabase 接続情報を設定（Gitにコミットしない）
pnpm dev
```

STG／本番の構築手順・管理者マニュアル：[docs/OPERATIONS.md](docs/OPERATIONS.md)

## コマンド
| コマンド | 内容 |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | 開発 / 本番ビルド / 起動 |
| `pnpm test` / `pnpm test:unit` / `pnpm test:db` | 全テスト / 単体 / 実DB |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm db:local:start` / `stop` / `reset` | ローカル PostgreSQL |
| `scripts/backup.sh backup` / `verify <file>` | バックアップ取得 / 復元検証 |

## ドキュメント
| 資料 | 内容 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | 開発ルール（AI・開発者向け） |
| [docs/ENVIRONMENT_AUDIT.md](docs/ENVIRONMENT_AUDIT.md) | Phase 0 環境調査 |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | 要件と実装状況 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 構成・多層防御・主要フロー |
| [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | テーブル・状態遷移・RPC・APP固有テーブルのテンプレート |
| [docs/PERMISSION_MATRIX.md](docs/PERMISSION_MATRIX.md) | 権限表 |
| [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) | API・連携ペイロード契約 |
| [docs/SECURITY.md](docs/SECURITY.md) | SEC01〜15 対応、残存リスク |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | AT01〜AT20 対応、テスト結果、試験運用シナリオ |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | 環境構築・**管理者操作マニュアル**・バックアップ・インシデント |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 設計判断・資料間の差異 |
| [docs/PROGRESS.md](docs/PROGRESS.md) / [docs/TODO.md](docs/TODO.md) / [docs/HANDOVER.md](docs/HANDOVER.md) | 進捗 / 未完了 / 引き継ぎ |
