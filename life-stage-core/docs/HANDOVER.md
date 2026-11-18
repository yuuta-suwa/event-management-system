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

## APP01（THE FINAL DISCOVERY）開発への引き継ぎ事項

### 共通基盤から使うもの
| 用途 | 使い方 |
|---|---|
| ログイン・本人識別 | 共通基盤と**同じ Supabase プロジェクト**の Auth（Google）。`auth.uid()` が利用者ID。APP01 で独自のログインは作らない |
| 利用可否 | サーバー側で `rpc('check_app_access', { p_app_code: 'APP01' })`、または `GET /api/apps/APP01/access`。画面の表示制御だけに頼らない |
| アクセス状態 | `rpc('my_access')`（status・roles・apps）。停止・権限取消は次のリクエストから即時反映 |
| データ保存 | APP01 固有テーブルを**追加 migration** で作成（DATABASE_SCHEMA.md のテンプレート：`user_id references profiles(id)`、RLS `user_id = auth.uid() and private.has_app_access('APP01')`、管理者閲覧ポリシーは作らない） |
| 画像（VISION BOARD） | Storage `user-files` の `<user_id>/APP01/...`（非公開。本人＋APP01 権限のみ）。共有は短時間の署名付きURLをサーバーで発行（未実装・APP01 で追加） |
| 共有（メンター／トレーナー／リーダー） | 共有先は `rpc('my_share_targets')`、作成・撤回は `create_share`／`revoke_share`。共有先の閲覧ポリシーは `data_shares` を参照（`app_snapshots_select` が見本） |
| APP02 への引き継ぎ | 最終確定時に `rpc('confirm_snapshot', { p_app_code:'APP01', p_snapshot_type:'life_blueprint', p_schema_version:'1.0', p_payload })` → 本人の「APP02 へ進む」で `POST /api/transfers/app01-to-app02`。失敗時は「引き継ぎを再試行する」で `POST /api/transfers/:id/retry`（同じ snapshot で冪等） |
| 同意 | `record_consent`（利用目的・プライバシー・共有） |
| 監査 | APP01 の重要操作は APP01 側の RPC で `private.audit(...)` を呼ぶ |

### APP01 仕様書と共通基盤の対応・未決
| APP01 仕様 | 共通基盤の状態 | 対応 |
|---|---|---|
| §10 APP02 引継ぎ契約（14項目） | `life_blueprint 1.0` として登録済み（API_CONTRACTS.md） | 項目の追加・変更は `app_snapshot_types` に新しい版（1.1 等）を登録 |
| §11 Assignment（mentor/trainer/leader） | `mentor_assignments.relation` で対応済み | — |
| §11 Share / Feedback | Share は `data_shares` で対応。**Feedback（受信者コメント）は未実装** | APP01 側でテーブル追加（share_id 参照、本人回答を上書きしない） |
| §6 AI 精査 | 共通基盤では扱わない（有料 AI API は導入しない方針） | 導入する場合は別途承認 |
| §7 PNG/PDF 共有 | 生成・署名付きURLは未実装 | APP01 で実装（ダウンロード済みは回収不可と明示） |
| §12 管理者は人生設計本文を原則閲覧しない | 共通基盤は管理者の個人データ閲覧ポリシーなし | APP01 でも管理者用ポリシーを作らない |

### 開発の進め方（推奨）
1. 共通基盤の専用リポジトリに `apps/app01`（または別リポジトリ）を作り、同じ Supabase 開発プロジェクトを使う。
2. 最初に APP01 固有テーブルの migration と、「他人・停止中・権限なし」で拒否されるDBテストを書く（`tests/db` の書き方を流用）。
3. 画面は LEVEL 01〜10 の自動保存から。確定は `confirm_snapshot`。
4. 共通基盤の `apps` で APP01 は `active`。試験運用時は利用者に APP01 権限を付与して確認する。
