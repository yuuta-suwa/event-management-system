# HANDOVER｜引き継ぎ資料

## 1分で把握
- 何か：LIFE STAGE APP01〜03（＋将来アプリ）共通の招待制アクセス基盤と共通DB。
- どこ：`life-stage-core/`（このリポジトリ内の独立 Next.js プロジェクト。親ディレクトリの既存イベント管理アプリとは無関係）。
- 状態：ローカル実DBで自動テスト84件合格。**Supabase/Vercel の STG は未構築**（承認待ち）。完成ではない。
- 最重要原則：**権限の正本は DB**。書き込みは SECURITY DEFINER RPC のみ、全テーブル RLS、管理操作は aal2、アプリは secret キーを使わない。

## 読む順番
1. `docs/PROGRESS.md`（現状）→ `docs/TODO.md`（依頼・未決）
2. `docs/ARCHITECTURE.md` → `docs/PERMISSION_MATRIX.md` → `docs/DATABASE_SCHEMA.md`
3. `docs/SECURITY.md` → `docs/TEST_PLAN.md`
4. `docs/OPERATIONS.md`（環境構築・管理者マニュアル）
5. `docs/DECISIONS.md`（なぜそうしたか）

## よくある変更の手順
| 変更 | 手順 |
|---|---|
| テーブル・RPC の追加/変更 | `supabase/migrations/` に**新しい番号のファイル**を追加（既存ファイルは編集しない）→ `tests/db` にテスト追加 → `pnpm test` |
| 新アプリの追加（APP04 等） | migration で `apps` に `is_active=false` で登録 → 承認後 `is_active=true` の migration |
| 管理画面の追加 | `src/app/admin/<name>/page.tsx` で必ず `requirePage({ kind: "admin" })`、書き込みは `src/app/admin/actions.ts` から RPC |
| エラーメッセージ追加 | RPC は英大文字コードで `private.fail('CODE')` → `src/lib/errors.ts` に日英文言 |
| APP 側からの権限確認 | `rpc('check_app_access', { p_app_code })` or `GET /api/apps/:code/access` |

## 絶対にしないこと
- `supabase/local/supabase_shim.sql` を Supabase に適用する。
- RLS を無効化する、authenticated にテーブルの INSERT/UPDATE/DELETE を付与する（profiles.display_name の UPDATE を除く）。
- 権限判定に `user_metadata` / `app_metadata` を使う。
- secret / service_role キーを `NEXT_PUBLIC_*` やクライアントコードに置く。
- 管理者用の「個人データ閲覧ポリシー」を追加する。
- 既存の migration ファイルを書き換える（適用済み環境と差分が出る）。

## 連絡事項
- APP01 実装リポジトリは未発見。APP02 の既存実装は `ticket-AI` の `feature/life-stage-2`（独自ロール方式。共通基盤とは未統合）。
- LIFE ACCOUNTING 資料は受領済み。共通基盤では無効アプリとして登録のみ（Q-09）。
