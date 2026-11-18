# DATABASE SCHEMA｜共通DB

マイグレーション：`supabase/migrations/`（番号順に適用）。全テーブル RLS 有効。主キー・外部キー・一意制約・CHECK 制約・インデックスを定義済み。

## テーブル一覧

| テーブル | 用途 | 主な制約 |
|---|---|---|
| `apps` | アプリ登録（APP01〜03、LIFE_ACCOUNTING は無効） | code 形式 CHECK、is_active |
| `profiles` | 利用者（**招待受諾時のみ作成**）。`id = auth.users.id` | email 小文字・一意、status ∈ invited/active/suspended/revoked/deletion_pending/deleted、version 自動加算 |
| `admin_roles` | 管理ロール super_admin/admin/mentor（User は暗黙） | 有効ロールは (user_id, role) で一意（部分一意索引） |
| `admin_user_scopes` | Admin の担当範囲 | 有効な (admin, user) は一意、自分自身不可 |
| `mentor_assignments` | メンター／トレーナー／リーダーの担当 | 有効な (mentor, user, relation) は一意、期間整合 |
| `invitations` | 招待（`token_hash` SHA-256 32byte のみ） | token_hash 一意、**同一メールの pending は1件**、状態別必須列 CHECK |
| `invitation_apps` | 招待で付与するアプリ | PK (invitation_id, app_code) |
| `app_entitlements` | アプリ別利用権限 | (user_id, app_code) 一意、revoked は revoked_at 必須、version |
| `consent_records` | 同意（種類・版・撤回） | consent_type 形式 CHECK |
| `data_shares` | 本人による明示共有 | 自分宛て不可、revoked は revoked_at 必須 |
| `app_snapshots` | 確定スナップショット（連携契約検証用） | 有効版は (user, app, type) で1件、版番号一意 |
| `data_transfers` | 転送履歴 | **冪等キー (source_snapshot_id, target_app, schema_version) 一意**、status/attempt/last_error |
| `transfer_inbox` | 転送先の受信データ（上書きしない） | transfer_id 一意 |
| `deletion_requests` | 削除手続き | 未完了申請は利用者ごとに1件 |
| `app_settings` | 設定（invitation_ttl_hours=72, require_admin_mfa=true） | key 形式 CHECK |
| `audit_logs` | 監査ログ（追記専用、FKなし） | UPDATE/DELETE/TRUNCATE をトリガーで拒否 |

Storage：バケット `user-files`（public=false、10MB、png/jpeg/webp/pdf）。パス `<user_id>/<app_code>/<file>`。

## 状態遷移

```
profiles.status
  (招待受諾) ──► active ──suspend──► suspended ──resume──► active
                   │  └──revoke──► revoked ──resume / 再招待──► active
                   └──削除確定──► deletion_pending ──取消──► 元の状態
invitations.status
  pending ──受諾──► accepted
     │ ├──取消──► revoked ──再発行──► superseded（新しい pending を作成）
     │ └──再発行──► superseded
     └──（期限切れは expires_at で判定。表示上 expired）
```

## 判定関数（private スキーマ・API 非公開）
`is_active_user`, `has_role`, `is_super_admin`, `is_admin`, `can_manage_user`, `has_app_access`, `is_assigned_mentor`, `require_admin`, `require_active_user`, `audit`。すべて DB の現在状態を参照。

## RPC（public・authenticated のみ実行可、anon 不可）
- 利用者：`my_access`, `check_app_access`, `accept_invitation`, `record_consent`, `withdraw_consent`, `request_own_deletion`, `cancel_own_deletion`, `my_export`, `my_share_targets`, `create_share`, `revoke_share`, `confirm_snapshot`, `request_transfer`, `retry_transfer`
- 管理者（aal2 必須）：`admin_create_invitation`, `admin_revoke_invitation`, `admin_reissue_invitation`, `admin_set_entitlement`, `admin_set_user_status`, `admin_set_role`★, `admin_set_scope`★, `admin_set_mentor_assignment`, `admin_list_users`, `admin_dashboard_stats`, `admin_update_setting`★, `admin_request_deletion`, `admin_decide_deletion`★（★＝Super Admin のみ）
- 運用者専用（service_role / SQL Editor）：`private.bootstrap_super_admin(email)`

## 各APP固有テーブルの追加テンプレート（各APP開発時）

```sql
create table public.app01_stage_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stage_id smallint not null check (stage_id between 1 and 10),
  version integer not null default 1,
  answers jsonb not null default '{}'::jsonb,
  status text not null check (status in ('locked','available','draft','reviewed','confirmed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, stage_id, version)
);
alter table public.app01_stage_responses enable row level security;
revoke all on public.app01_stage_responses from anon, authenticated;
grant select, insert, update on public.app01_stage_responses to authenticated;
create policy own_rows on public.app01_stage_responses for all to authenticated
  using (user_id = (select auth.uid()) and private.has_app_access('APP01'))
  with check (user_id = (select auth.uid()) and private.has_app_access('APP01'));
```
- 管理者用の閲覧ポリシーは**作らない**（個人データは本人と明示共有先のみ）。共有先閲覧は `data_shares` を参照するポリシーを追加する（`app_snapshots_select` を参照）。
- 想定テーブル（SPEC §5）：life_blueprints, stage_responses, vision_assets（APP01）／growth_plans, capability_assessments, roadmap_cells（APP02）／career_maps, career_cells, achievements, certifications, title_awards（APP03）。詳細カラムは各APP仕様と実装確認後に確定。

## アプリ登録マスター（migration 0009）

| テーブル | 用途 | 主な制約 |
|---|---|---|
| `apps`（拡張） | `lifecycle`（planned/development/trial/active/retired）、`base_url`（https のみ）、`allowed_redirect_origins`（https オリジンのみ）、`data_classification`（standard/sensitive）、`owner_label`、`launched_at`、`retired_at`。**`is_active` は lifecycle が trial/active のとき true になる自動算出列** | CHECK 制約 |
| `app_role_definitions` | アプリ固有ロールの定義（APP02 `legacy_eligible`、APP03 `reviewer`・`business_admin`） | PK(app_code, role_code)、grantable_by、scoped |
| `user_app_roles` | アプリ固有ロールの付与（scope_key＝事業ID等） | 有効な (user, app, role, scope) は一意 |
| `app_snapshot_types` | 各アプリが確定・送出するデータの種類・版・必須項目 | PK(app_code, snapshot_type, schema_version) |
| `transfer_routes` | 連携経路（APP01→APP02、APP02→APP03） | 元の種類・版への FK、(元, 種類, 版, 先) 一意 |

追加 RPC：`admin_set_app_role`（担当範囲内・grantable_by に応じ SA のみ・アプリ権限が前提・範囲必須チェック）、`admin_set_app_lifecycle`（SA のみ・理由必須）。
追加判定関数：`private.has_app_role(app, role, scope)`（各APPの RLS から使用。アプリ権限・本人の active を含めて判定）。

### 新アプリ（APP04・LIFE ACCOUNTING 等）の追加手順
1. migration で `apps` に `lifecycle='planned'` で登録（必要なら `app_role_definitions`・`app_snapshot_types`・`transfer_routes` も登録）。
2. 発注者承認後、SETTINGS 画面（Super Admin）で `trial` → 試験運用者に権限付与 → `active`。
3. アプリ固有テーブルは本書「各APP固有テーブルの追加テンプレート」に従い、RLS で `private.has_app_access('<APP>')`（必要に応じ `private.has_app_role`）を使う。
**共通基盤のコード変更は不要。**
