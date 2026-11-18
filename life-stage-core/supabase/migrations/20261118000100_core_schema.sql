-- =====================================================================
-- LIFE STAGE COMMON CORE  |  0001 schema
-- 共通アクセス権・データベース基盤：テーブル・制約・インデックス
--
-- 原則
--  * auth.users.id を本人識別の正本とする。
--  * 権限判定に使うのはこのスキーマのテーブルだけ。user_metadata 等の
--    利用者が変更できる値は一切使わない。
--  * テーブルへの直接書き込みは原則禁止。書き込みは private/public の
--    SECURITY DEFINER 関数（権限確認＋監査記録込み）からのみ行う。
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- API(PostgREST)に公開しない内部スキーマ
create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- アプリ登録（APP01/02/03 と将来追加アプリ）
-- ---------------------------------------------------------------------
create table public.apps (
  code         text primary key check (code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  name_en      text not null check (length(name_en) between 1 and 120),
  name_ja      text not null check (length(name_ja) between 1 and 120),
  description  text not null default '' check (length(description) <= 1000),
  is_active    boolean not null default false,
  sort_order   integer not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.apps is 'アプリ登録。is_active=false のアプリには権限を付与できない。';

-- ---------------------------------------------------------------------
-- 利用者プロフィール（招待受諾時にのみ作成される）
-- ---------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  display_name       text not null default '' check (length(display_name) <= 80),
  status             text not null default 'active'
                       check (status in ('invited','active','suspended','revoked','deletion_pending','deleted')),
  status_reason      text check (length(status_reason) <= 500),
  status_changed_at  timestamptz not null default now(),
  status_changed_by  uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            integer not null default 1
);
create unique index profiles_email_key on public.profiles (email);
create index profiles_status_idx on public.profiles (status);
comment on table public.profiles is 'Google認証に成功しても、招待を受諾するまでは行が存在しない＝利用不可。';

-- ---------------------------------------------------------------------
-- 管理者ロール（User は暗黙。Suspended はロールではなく profiles.status）
-- ---------------------------------------------------------------------
create table public.admin_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('super_admin','admin','mentor')),
  granted_by  uuid references public.profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  revoked_by  uuid references public.profiles(id) on delete set null,
  revoked_at  timestamptz,
  reason      text check (length(reason) <= 500)
);
create unique index admin_roles_active_key on public.admin_roles (user_id, role) where revoked_at is null;
create index admin_roles_role_idx on public.admin_roles (role) where revoked_at is null;

-- Admin の担当範囲（担当する利用者）
create table public.admin_user_scopes (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid not null references public.profiles(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  assigned_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  check (admin_id <> user_id)
);
create unique index admin_user_scopes_active_key on public.admin_user_scopes (admin_id, user_id) where revoked_at is null;
create index admin_user_scopes_user_idx on public.admin_user_scopes (user_id) where revoked_at is null;

-- メンター／トレーナー／リーダーの担当
create table public.mentor_assignments (
  id           uuid primary key default gen_random_uuid(),
  mentor_id    uuid not null references public.profiles(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  relation     text not null default 'mentor' check (relation in ('mentor','trainer','leader')),
  assigned_by  uuid references public.profiles(id) on delete set null,
  active_from  timestamptz not null default now(),
  active_to    timestamptz,
  created_at   timestamptz not null default now(),
  check (mentor_id <> user_id),
  check (active_to is null or active_to > active_from)
);
create unique index mentor_assignments_active_key on public.mentor_assignments (mentor_id, user_id, relation) where active_to is null;
create index mentor_assignments_user_idx on public.mentor_assignments (user_id);

-- ---------------------------------------------------------------------
-- 招待（トークンは SHA-256 ハッシュのみ保存）
-- ---------------------------------------------------------------------
create table public.invitations (
  id                uuid primary key default gen_random_uuid(),
  email             text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_hash        bytea not null unique check (length(token_hash) = 32),
  status            text not null default 'pending' check (status in ('pending','accepted','revoked','superseded')),
  grant_admin_role  text check (grant_admin_role in ('super_admin','admin','mentor')),
  expires_at        timestamptz not null,
  invited_by        uuid references public.profiles(id) on delete set null,
  note              text check (length(note) <= 500),
  accepted_at       timestamptz,
  accepted_by       uuid references auth.users(id) on delete set null,
  revoked_at        timestamptz,
  revoked_by        uuid references public.profiles(id) on delete set null,
  revoke_reason     text check (length(revoke_reason) <= 500),
  reissued_from     uuid references public.invitations(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (status <> 'accepted' or (accepted_at is not null and accepted_by is not null)),
  check (status <> 'revoked' or revoked_at is not null)
);
-- 同一メールアドレスの有効（pending）招待は常に1件まで
create unique index invitations_one_pending_per_email on public.invitations (email) where status = 'pending';
create index invitations_status_idx on public.invitations (status, expires_at);
create index invitations_invited_by_idx on public.invitations (invited_by);

create table public.invitation_apps (
  invitation_id  uuid not null references public.invitations(id) on delete cascade,
  app_code       text not null references public.apps(code),
  primary key (invitation_id, app_code)
);

-- ---------------------------------------------------------------------
-- アプリ別利用権限（APP01 の権限は APP02/03 を含意しない）
-- ---------------------------------------------------------------------
create table public.app_entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  app_code    text not null references public.apps(code),
  status      text not null default 'active' check (status in ('active','revoked')),
  granted_by  uuid references public.profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  revoked_by  uuid references public.profiles(id) on delete set null,
  revoked_at  timestamptz,
  reason      text check (length(reason) <= 500),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1,
  unique (user_id, app_code),
  check (status <> 'revoked' or revoked_at is not null)
);
create index app_entitlements_app_idx on public.app_entitlements (app_code, status);

-- ---------------------------------------------------------------------
-- 同意記録
-- ---------------------------------------------------------------------
create table public.consent_records (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  consent_type     text not null check (consent_type ~ '^[a-z0-9_]{2,64}$'),
  consent_version  text not null check (length(consent_version) between 1 and 32),
  app_code         text references public.apps(code),
  granted_at       timestamptz not null default now(),
  withdrawn_at     timestamptz,
  source           text not null default 'web' check (source in ('web','api','admin_record'))
);
create index consent_records_user_idx on public.consent_records (user_id, consent_type, granted_at desc);

-- ---------------------------------------------------------------------
-- 本人による明示共有（メンター等は共有された範囲だけ閲覧）
-- ---------------------------------------------------------------------
create table public.data_shares (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  grantee_id     uuid not null references public.profiles(id) on delete cascade,
  app_code       text not null references public.apps(code),
  resource_type  text not null check (resource_type ~ '^[a-z0-9_]{2,64}$'),
  resource_id    uuid,
  scope          jsonb not null default '{}'::jsonb check (jsonb_typeof(scope) = 'object'),
  permission     text not null default 'read' check (permission in ('read','comment')),
  status         text not null default 'active' check (status in ('active','revoked')),
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  check (owner_id <> grantee_id),
  check (status <> 'revoked' or revoked_at is not null)
);
create index data_shares_grantee_idx on public.data_shares (grantee_id, status);
create index data_shares_owner_idx on public.data_shares (owner_id, status);
create index data_shares_resource_idx on public.data_shares (resource_type, resource_id) where status = 'active';

-- ---------------------------------------------------------------------
-- 連携契約検証用：アプリ確定スナップショット（各APP本体の詳細テーブルは各APP開発時に追加）
-- ---------------------------------------------------------------------
create table public.app_snapshots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  app_code        text not null references public.apps(code),
  snapshot_type   text not null check (snapshot_type in ('life_blueprint','growth_plan')),
  schema_version  text not null check (schema_version ~ '^[0-9]+\.[0-9]+$'),
  payload         jsonb not null check (jsonb_typeof(payload) = 'object'),
  version         integer not null,
  confirmed_at    timestamptz not null default now(),
  superseded_at   timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, app_code, snapshot_type, version)
);
create unique index app_snapshots_one_current on public.app_snapshots (user_id, app_code, snapshot_type) where superseded_at is null;

-- ---------------------------------------------------------------------
-- データ転送（冪等キー＝元スナップショットID×転送先×スキーマ版）
-- ---------------------------------------------------------------------
create table public.data_transfers (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  source_app           text not null references public.apps(code),
  target_app           text not null references public.apps(code),
  source_snapshot_id   uuid not null references public.app_snapshots(id),
  schema_version       text not null check (schema_version ~ '^[0-9]+\.[0-9]+$'),
  status               text not null default 'pending'
                         check (status in ('pending','succeeded','failed')),
  attempt_count        integer not null default 0 check (attempt_count >= 0),
  last_error           text check (length(last_error) <= 1000),
  consent_version      text not null,
  user_confirmed_at    timestamptz not null,
  source_superseded_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  completed_at         timestamptz,
  check (source_app <> target_app),
  unique (source_snapshot_id, target_app, schema_version)
);
create index data_transfers_user_idx on public.data_transfers (user_id, created_at desc);
create index data_transfers_status_idx on public.data_transfers (status, updated_at desc);

-- 転送先が受け取ったデータ（転送先の正本・既存実績を上書きしない「受信箱」）
create table public.transfer_inbox (
  id           uuid primary key default gen_random_uuid(),
  transfer_id  uuid not null unique references public.data_transfers(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  target_app   text not null references public.apps(code),
  payload      jsonb not null,
  received_at  timestamptz not null default now()
);
create index transfer_inbox_user_idx on public.transfer_inbox (user_id, target_app, received_at desc);

-- ---------------------------------------------------------------------
-- アカウント削除手続き（二段階：申請 → Super Admin 確認）
-- ---------------------------------------------------------------------
create table public.deletion_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  requested_by  uuid references public.profiles(id) on delete set null,
  source        text not null check (source in ('self','admin')),
  status        text not null default 'requested' check (status in ('requested','confirmed','cancelled','completed')),
  reason        text check (length(reason) <= 1000),
  previous_status text,
  confirmed_by  uuid references public.profiles(id) on delete set null,
  requested_at  timestamptz not null default now(),
  confirmed_at  timestamptz,
  cancelled_at  timestamptz,
  completed_at  timestamptz
);
create unique index deletion_requests_one_open on public.deletion_requests (user_id) where status in ('requested','confirmed');

-- ---------------------------------------------------------------------
-- 設定
-- ---------------------------------------------------------------------
create table public.app_settings (
  key         text primary key check (key ~ '^[a-z0-9_]{2,64}$'),
  value       jsonb not null,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 監査ログ（追記専用。外部キーなし＝対象削除後も記録が残る）
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id              bigint generated always as identity primary key,
  occurred_at     timestamptz not null default now(),
  actor_id        uuid,
  actor_aal       text,
  action          text not null check (action ~ '^[a-z0-9_.]{2,64}$'),
  target_type     text,
  target_id       text,
  target_user_id  uuid,
  app_code        text,
  before_state    jsonb,
  after_state     jsonb,
  reason          text,
  success         boolean not null default true
);
create index audit_logs_occurred_idx on public.audit_logs (occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);
create index audit_logs_target_user_idx on public.audit_logs (target_user_id, occurred_at desc);
create index audit_logs_action_idx on public.audit_logs (action, occurred_at desc);

-- ---------------------------------------------------------------------
-- 共通トリガー
-- ---------------------------------------------------------------------
create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function private.bump_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;

create trigger apps_touch before update on public.apps for each row execute function private.touch_updated_at();
create trigger invitations_touch before update on public.invitations for each row execute function private.touch_updated_at();
create trigger data_transfers_touch before update on public.data_transfers for each row execute function private.touch_updated_at();
create trigger profiles_version before update on public.profiles for each row execute function private.bump_version();
create trigger app_entitlements_version before update on public.app_entitlements for each row execute function private.bump_version();

-- 監査ログの改ざん防止（UPDATE/DELETE/TRUNCATE を常に拒否）
create or replace function private.audit_logs_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'AUDIT_LOG_IMMUTABLE' using errcode = 'P0001';
end $$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function private.audit_logs_immutable();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function private.audit_logs_immutable();
