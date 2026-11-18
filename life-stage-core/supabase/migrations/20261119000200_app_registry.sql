-- =====================================================================
-- LIFE STAGE COMMON CORE  |  0009 アプリ登録マスター方式
--
-- 新アプリ（APP04 以降・LIFE ACCOUNTING 等）を「データの登録」で追加できるようにする。
--  * apps                 : 公開段階（lifecycle）、URL、データ区分、管理責任者
--  * app_role_definitions : アプリ固有ロールの定義（APP02 LEGACY 資格、APP03 審査者 等）
--  * user_app_roles       : アプリ固有ロールの付与（担当範囲・MFA・監査は共通 RPC が強制）
--  * app_snapshot_types   : 各アプリが確定・送出するデータの種類・版・必須項目
--  * transfer_routes      : アプリ間連携の経路（コード固定を廃止）
-- 既存データは保持。既存列 is_active は lifecycle から自動算出する列に置き換える。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. apps の拡張
-- ---------------------------------------------------------------------
create or replace function private.all_https_origins(p text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(o ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'), true) from unnest(p) o
$$;

alter table public.apps
  add column lifecycle text not null default 'planned'
    check (lifecycle in ('planned','development','trial','active','retired')),
  add column base_url text
    check (base_url is null or (base_url ~ '^https://[^\s<>"]+$' and length(base_url) <= 2048)),
  add column allowed_redirect_origins text[] not null default '{}'
    check (private.all_https_origins(allowed_redirect_origins)),
  add column data_classification text not null default 'standard'
    check (data_classification in ('standard','sensitive')),
  add column owner_label text check (length(owner_label) <= 120),
  add column launched_at timestamptz,
  add column retired_at timestamptz;

update public.apps set lifecycle = case when is_active then 'active' else 'planned' end;
update public.apps set data_classification = 'sensitive' where code in ('APP01','APP02','APP03','LIFE_ACCOUNTING');

-- is_active を lifecycle から算出（trial / active のみ権限付与・利用可能）
alter table public.apps drop column is_active;
alter table public.apps add column is_active boolean generated always as (lifecycle in ('trial','active')) stored;
create index apps_lifecycle_idx on public.apps (lifecycle);

-- ---------------------------------------------------------------------
-- 2. アプリ固有ロール
-- ---------------------------------------------------------------------
create table public.app_role_definitions (
  app_code      text not null references public.apps(code),
  role_code     text not null check (role_code ~ '^[a-z][a-z0-9_]{1,47}$'),
  name_en       text not null check (length(name_en) between 1 and 120),
  name_ja       text not null check (length(name_ja) between 1 and 120),
  description   text not null default '' check (length(description) <= 1000),
  grantable_by  text not null default 'super_admin' check (grantable_by in ('super_admin','admin')),
  scoped        boolean not null default false,   -- true: scope（例：APP03 の事業ID）を必須にする
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  primary key (app_code, role_code)
);

create table public.user_app_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  app_code    text not null,
  role_code   text not null,
  scope_key   text not null default '' check (length(scope_key) <= 120),
  granted_by  uuid references public.profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  revoked_by  uuid references public.profiles(id) on delete set null,
  revoked_at  timestamptz,
  reason      text check (length(reason) <= 500),
  foreign key (app_code, role_code) references public.app_role_definitions(app_code, role_code)
);
create unique index user_app_roles_active_key on public.user_app_roles (user_id, app_code, role_code, scope_key) where revoked_at is null;
create index user_app_roles_app_idx on public.user_app_roles (app_code, role_code) where revoked_at is null;

-- ---------------------------------------------------------------------
-- 3. スナップショット種別・連携経路
-- ---------------------------------------------------------------------
create table public.app_snapshot_types (
  app_code        text not null references public.apps(code),
  snapshot_type   text not null check (snapshot_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  schema_version  text not null check (schema_version ~ '^[0-9]+\.[0-9]+$'),
  required_keys   text[] not null default '{}',
  description     text not null default '' check (length(description) <= 1000),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  primary key (app_code, snapshot_type, schema_version)
);

create table public.transfer_routes (
  id              uuid primary key default gen_random_uuid(),
  source_app      text not null,
  snapshot_type   text not null,
  schema_version  text not null,
  target_app      text not null references public.apps(code),
  is_active       boolean not null default true,
  description     text not null default '' check (length(description) <= 1000),
  created_at      timestamptz not null default now(),
  foreign key (source_app, snapshot_type, schema_version)
    references public.app_snapshot_types(app_code, snapshot_type, schema_version),
  check (source_app <> target_app),
  unique (source_app, snapshot_type, schema_version, target_app)
);

-- app_snapshots の種別を固定 CHECK からマスター参照へ
alter table public.app_snapshots drop constraint app_snapshots_snapshot_type_check;
alter table public.app_snapshots add constraint app_snapshots_type_fk
  foreign key (app_code, snapshot_type, schema_version)
  references public.app_snapshot_types(app_code, snapshot_type, schema_version);

-- ---------------------------------------------------------------------
-- 4. 初期データ（既存の連携契約を移行）
-- ---------------------------------------------------------------------
insert into public.app_snapshot_types (app_code, snapshot_type, schema_version, required_keys, description) values
  ('APP01', 'life_blueprint', '1.0',
   array['blueprint_id','life_purpose','priority_desires','budget_summary','vision_board_asset_refs',
         'gap_analysis','goals','priority_capabilities','first_action','first_action_date','consent_version'],
   'MY LIFE BLUEPRINT 確定スナップショット（APP01仕様書 §10）'),
  ('APP02', 'growth_plan', '1.0',
   array['plan_id','vision_version','start_year','mode','focus_abilities','cells','provisional_assessment','approved_at'],
   '承認済み10ヵ年成長計画（APP02仕様書 §21）。6能力×10年＝60セル');

insert into public.transfer_routes (source_app, snapshot_type, schema_version, target_app, description) values
  ('APP01', 'life_blueprint', '1.0', 'APP02', '人生設計 → 成長戦略'),
  ('APP02', 'growth_plan', '1.0', 'APP03', '成長計画 → 実行・実績・認定（APP03 は「目標」として受け取り、実績と別管理）');

insert into public.app_role_definitions (app_code, role_code, name_en, name_ja, description, grantable_by, scoped) values
  ('APP02', 'legacy_eligible', 'LEGACY ELIGIBLE', 'LEGACY モード利用資格',
   'APP02 仕様書 §03：LEGACY の利用資格は管理者が設定し、本人の希望だけで付与しない', 'super_admin', false),
  ('APP03', 'reviewer', 'CERTIFICATION REVIEWER', '認定審査者',
   'APP03 仕様書 §12：割当範囲の証拠確認・承認・差戻し', 'super_admin', true),
  ('APP03', 'business_admin', 'BUSINESS ADMIN', '事業管理者',
   'APP03 仕様書 §12：担当事業の条件・クエスト編集、公開申請', 'super_admin', true);

-- LIFE ACCOUNTING は登録のみ（lifecycle=planned のまま）。本体・権限付与は発注者承認後

-- ---------------------------------------------------------------------
-- 5. 権限・RLS
-- ---------------------------------------------------------------------
alter table public.app_role_definitions enable row level security;
alter table public.user_app_roles enable row level security;
alter table public.app_snapshot_types enable row level security;
alter table public.transfer_routes enable row level security;
revoke all on public.app_role_definitions, public.user_app_roles, public.app_snapshot_types, public.transfer_routes from anon, authenticated;
grant select on public.app_role_definitions, public.user_app_roles, public.app_snapshot_types, public.transfer_routes to authenticated;

create policy app_role_definitions_select on public.app_role_definitions for select to authenticated
  using (private.is_active_user());
create policy app_snapshot_types_select on public.app_snapshot_types for select to authenticated
  using (private.is_active_user());
create policy transfer_routes_select on public.transfer_routes for select to authenticated
  using (private.is_active_user());
create policy user_app_roles_select on public.user_app_roles for select to authenticated
  using ((user_id = auth.uid() and private.is_active_user()) or private.can_manage_user(user_id));

-- アプリ固有ロールの判定（各APPの RLS から使用）
create or replace function private.has_app_role(p_app text, p_role text, p_scope text default '', p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_app_access(p_app, p_uid) and exists (
    select 1 from public.user_app_roles r
    join public.app_role_definitions d on d.app_code = r.app_code and d.role_code = r.role_code and d.is_active
    where r.user_id = p_uid and r.app_code = p_app and r.role_code = p_role and r.revoked_at is null
      and (coalesce(p_scope, '') = '' or r.scope_key = p_scope)
  )
$$;
revoke execute on function private.has_app_role(text, text, text, uuid), private.all_https_origins(text[]) from public;
grant execute on function private.has_app_role(text, text, text, uuid) to authenticated, service_role;
grant execute on function private.all_https_origins(text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. 管理 RPC
-- ---------------------------------------------------------------------
-- アプリ固有ロールの付与・取消
create or replace function public.admin_set_app_role(
  p_user_id uuid, p_app_code text, p_role_code text, p_grant boolean, p_scope_key text default '', p_reason text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid   uuid := private.require_admin();
  v_def   public.app_role_definitions;
  v_scope text := trim(coalesce(p_scope_key, ''));
  v_has   boolean;
begin
  select * into v_def from public.app_role_definitions where app_code = p_app_code and role_code = p_role_code and is_active;
  if not found then perform private.fail('INVALID_ROLE'); end if;
  if v_def.grantable_by = 'super_admin' and not private.is_super_admin(v_uid) then perform private.fail('FORBIDDEN'); end if;
  if p_user_id = v_uid then perform private.fail('CANNOT_TARGET_SELF'); end if;
  if not private.can_manage_user(p_user_id, v_uid) then perform private.fail('FORBIDDEN'); end if;
  if v_def.scoped and v_scope = '' then perform private.fail('SCOPE_REQUIRED'); end if;
  if not v_def.scoped then v_scope := ''; end if;
  v_has := exists (select 1 from public.user_app_roles where user_id = p_user_id and app_code = p_app_code
                   and role_code = p_role_code and scope_key = v_scope and revoked_at is null);
  if p_grant then
    -- アプリ自体の利用権限がない利用者にはアプリ固有ロールを付与しない
    if not private.has_app_access(p_app_code, p_user_id) then perform private.fail('APP_ACCESS_DENIED'); end if;
    if v_has then return jsonb_build_object('changed', false); end if;
    insert into public.user_app_roles(user_id, app_code, role_code, scope_key, granted_by, reason)
      values (p_user_id, p_app_code, p_role_code, v_scope, v_uid, p_reason);
  else
    if not v_has then return jsonb_build_object('changed', false); end if;
    update public.user_app_roles set revoked_at = now(), revoked_by = v_uid, reason = p_reason
     where user_id = p_user_id and app_code = p_app_code and role_code = p_role_code and scope_key = v_scope and revoked_at is null;
  end if;
  perform private.audit(case when p_grant then 'app_role.grant' else 'app_role.revoke' end,
    'user_app_role', p_role_code, p_user_id, p_app_code,
    jsonb_build_object('has_role', v_has), jsonb_build_object('has_role', p_grant, 'scope', v_scope), p_reason);
  return jsonb_build_object('changed', true, 'granted', p_grant);
end $$;

-- アプリの公開段階の変更（Super Admin のみ。発注者承認後に実施する運用）
create or replace function public.admin_set_app_lifecycle(p_app_code text, p_lifecycle text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin(true);
  v_app public.apps;
begin
  if p_lifecycle not in ('planned','development','trial','active','retired') then perform private.fail('INVALID_ACTION'); end if;
  if coalesce(trim(p_reason), '') = '' then perform private.fail('REASON_REQUIRED'); end if;
  select * into v_app from public.apps where code = p_app_code for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  update public.apps set lifecycle = p_lifecycle,
         launched_at = case when p_lifecycle = 'active' and launched_at is null then now() else launched_at end,
         retired_at  = case when p_lifecycle = 'retired' then now() else null end
   where code = p_app_code;
  perform private.audit('app.lifecycle', 'app', p_app_code, null, p_app_code,
    jsonb_build_object('lifecycle', v_app.lifecycle), jsonb_build_object('lifecycle', p_lifecycle), p_reason);
  return jsonb_build_object('app_code', p_app_code, 'lifecycle', p_lifecycle);
end $$;

-- ---------------------------------------------------------------------
-- 7. 連携 RPC をマスター参照に置き換え（挙動・エラーコードは従来どおり）
-- ---------------------------------------------------------------------
create or replace function public.confirm_snapshot(p_app_code text, p_snapshot_type text, p_schema_version text, p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := private.require_active_user();
  v_prev public.app_snapshots;
  v_id   uuid;
  v_ver  integer;
begin
  if not exists (select 1 from public.app_snapshot_types t
                 where t.app_code = p_app_code and t.snapshot_type = p_snapshot_type
                   and t.schema_version = p_schema_version and t.is_active) then
    perform private.fail('INVALID_SNAPSHOT_TYPE');
  end if;
  if not private.has_app_access(p_app_code, v_uid) then perform private.fail('APP_ACCESS_DENIED'); end if;

  select * into v_prev from public.app_snapshots
   where user_id = v_uid and app_code = p_app_code and snapshot_type = p_snapshot_type and superseded_at is null
   for update;
  if found then
    update public.app_snapshots set superseded_at = now() where id = v_prev.id;
    update public.data_transfers set source_superseded_at = now() where source_snapshot_id = v_prev.id;
  end if;
  select coalesce(max(version), 0) + 1 into v_ver from public.app_snapshots
   where user_id = v_uid and app_code = p_app_code and snapshot_type = p_snapshot_type;
  insert into public.app_snapshots(user_id, app_code, snapshot_type, schema_version, payload, version)
    values (v_uid, p_app_code, p_snapshot_type, p_schema_version, p_payload, v_ver) returning id into v_id;
  perform private.audit('snapshot.confirm', 'app_snapshot', v_id::text, v_uid, p_app_code, null,
    jsonb_build_object('snapshot_type', p_snapshot_type, 'version', v_ver, 'schema_version', p_schema_version));
  return jsonb_build_object('snapshot_id', v_id, 'version', v_ver, 'superseded_snapshot_id', v_prev.id);
end $$;

-- 検証：必須項目はマスター、種別固有の規則（60セル・認定混入禁止）は関数内
create or replace function private.validate_snapshot_payload(p_app text, p_type text, p_schema text, p_payload jsonb) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_required text[];
  v_missing  text;
  v_cells    integer;
begin
  select required_keys into v_required from public.app_snapshot_types
   where app_code = p_app and snapshot_type = p_type and schema_version = p_schema and is_active;
  if v_required is null then return 'UNSUPPORTED_SCHEMA_VERSION'; end if;
  select k into v_missing from unnest(v_required) k where not (p_payload ? k) limit 1;
  if v_missing is not null then return 'MISSING_FIELD:' || v_missing; end if;

  if p_type = 'growth_plan' then
    -- APP02 は 6能力×10年＝60セル。APP03 の 7能力×10年＝70マスと混同しない
    if jsonb_typeof(p_payload->'cells') <> 'array' then return 'INVALID_CELLS'; end if;
    select count(distinct (c->>'ability', c->>'year_index')) into v_cells
      from jsonb_array_elements(p_payload->'cells') c
     where c->>'ability' in ('attraction','recruitment','education','development','operations','management')
       and (c->>'year_index') ~ '^([1-9]|10)$';
    if jsonb_array_length(p_payload->'cells') <> 60 or v_cells <> 60 then return 'INVALID_CELLS:EXPECTED_6x10'; end if;
    -- APP02 の暫定診断は正式認定ではない
    if p_payload ? 'certifications' or p_payload ? 'titles' or p_payload ? 'certified_levels' then
      return 'CERTIFICATION_FIELDS_NOT_ALLOWED';
    end if;
  end if;
  return null;
end $$;
revoke execute on function private.validate_snapshot_payload(text, text, text, jsonb) from public;

create or replace function private.deliver_transfer(p_transfer_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_t    public.data_transfers;
  v_s    public.app_snapshots;
  v_err  text;
begin
  select * into v_t from public.data_transfers where id = p_transfer_id for update;
  if v_t.status = 'succeeded' then
    return jsonb_build_object('transfer_id', v_t.id, 'status', v_t.status, 'idempotent', true);
  end if;
  select * into v_s from public.app_snapshots where id = v_t.source_snapshot_id;

  v_err := case
    when not exists (select 1 from public.transfer_routes r
                     where r.source_app = v_s.app_code and r.snapshot_type = v_s.snapshot_type
                       and r.schema_version = v_t.schema_version and r.target_app = v_t.target_app and r.is_active)
      then 'ROUTE_DISABLED'
    when not private.has_app_access(v_t.target_app, v_t.user_id) then 'TARGET_APP_ACCESS_DENIED'
    else private.validate_snapshot_payload(v_s.app_code, v_s.snapshot_type, v_t.schema_version, v_s.payload)
  end;

  if v_err is not null then
    update public.data_transfers set status = 'failed', attempt_count = attempt_count + 1, last_error = v_err
     where id = v_t.id;
    perform private.audit('transfer.attempt', 'data_transfer', v_t.id::text, v_t.user_id, v_t.target_app, null,
      jsonb_build_object('status', 'failed', 'error', v_err, 'attempt', v_t.attempt_count + 1), null, false);
    return jsonb_build_object('transfer_id', v_t.id, 'status', 'failed', 'error', v_err, 'idempotent', false);
  end if;

  insert into public.transfer_inbox(transfer_id, user_id, target_app, payload)
    values (v_t.id, v_t.user_id, v_t.target_app,
            v_s.payload || jsonb_build_object('user_id', v_s.user_id, 'snapshot_id', v_s.id, 'source_app', v_s.app_code,
                                              'schema_version', v_t.schema_version, 'confirmed_at', v_s.confirmed_at))
    on conflict (transfer_id) do nothing;
  update public.data_transfers set status = 'succeeded', attempt_count = attempt_count + 1, last_error = null,
         completed_at = now() where id = v_t.id;
  perform private.audit('transfer.attempt', 'data_transfer', v_t.id::text, v_t.user_id, v_t.target_app, null,
    jsonb_build_object('status', 'succeeded', 'attempt', v_t.attempt_count + 1));
  return jsonb_build_object('transfer_id', v_t.id, 'status', 'succeeded', 'idempotent', false);
end $$;

create or replace function public.request_transfer(
  p_source_snapshot_id uuid, p_target_app text, p_schema_version text, p_consent_version text
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_s   public.app_snapshots;
  v_id  uuid;
begin
  select * into v_s from public.app_snapshots where id = p_source_snapshot_id and user_id = v_uid;
  if not found then perform private.fail('NOT_FOUND'); end if;
  if not exists (select 1 from public.transfer_routes r
                 where r.source_app = v_s.app_code and r.snapshot_type = v_s.snapshot_type
                   and r.schema_version = v_s.schema_version and r.target_app = p_target_app and r.is_active) then
    perform private.fail('INVALID_ROUTE');
  end if;
  if not private.has_app_access(v_s.app_code, v_uid) then perform private.fail('APP_ACCESS_DENIED'); end if;
  if v_s.superseded_at is not null then perform private.fail('SNAPSHOT_SUPERSEDED'); end if;
  if p_schema_version is distinct from v_s.schema_version then perform private.fail('SCHEMA_VERSION_MISMATCH'); end if;
  if coalesce(trim(p_consent_version), '') = '' then perform private.fail('CONSENT_REQUIRED'); end if;

  insert into public.data_transfers(user_id, source_app, target_app, source_snapshot_id, schema_version,
                                    consent_version, user_confirmed_at)
    values (v_uid, v_s.app_code, p_target_app, v_s.id, p_schema_version, p_consent_version, now())
    on conflict (source_snapshot_id, target_app, schema_version) do nothing
    returning id into v_id;

  if v_id is null then
    select id into v_id from public.data_transfers
     where source_snapshot_id = v_s.id and target_app = p_target_app and schema_version = p_schema_version;
  else
    insert into public.consent_records(user_id, consent_type, consent_version, app_code, source)
      values (v_uid, 'data_transfer_' || lower(v_s.app_code) || '_' || lower(p_target_app), p_consent_version, p_target_app, 'api');
    perform private.audit('transfer.request', 'data_transfer', v_id::text, v_uid, p_target_app, null,
      jsonb_build_object('source_snapshot_id', v_s.id, 'schema_version', p_schema_version));
  end if;
  return private.deliver_transfer(v_id);
end $$;

-- 旧検証関数は使用しない（参照なし）
drop function private.validate_transfer_payload(text, text, jsonb);

-- my_access：アプリ一覧に公開段階を含める
create or replace function public.my_access() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_prof   public.profiles;
  v_email  text;
  v_active boolean;
begin
  if v_uid is null then
    return jsonb_build_object('authenticated', false, 'status', 'anonymous');
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  select * into v_prof from public.profiles where id = v_uid;
  v_active := found and v_prof.status = 'active';
  return jsonb_build_object(
    'authenticated', true,
    'user_id', v_uid,
    'email', coalesce(v_prof.email, v_email),
    'display_name', coalesce(v_prof.display_name, ''),
    'status', coalesce(v_prof.status, 'not_invited'),
    'aal', private.current_aal(),
    'admin_mfa_required', (private.setting('require_admin_mfa', 'true'::jsonb))::text = 'true',
    'roles', case when v_active then coalesce((select jsonb_agg(r.role order by r.role) from public.admin_roles r
                                                where r.user_id = v_uid and r.revoked_at is null), '[]'::jsonb)
                  else '[]'::jsonb end,
    'apps', coalesce((select jsonb_agg(jsonb_build_object(
                         'code', a.code, 'name_en', a.name_en, 'name_ja', a.name_ja, 'lifecycle', a.lifecycle,
                         'base_url', a.base_url,
                         'granted', v_active and exists (select 1 from public.app_entitlements e
                                         where e.user_id = v_uid and e.app_code = a.code and e.status = 'active'),
                         'app_roles', case when v_active then coalesce((select jsonb_agg(jsonb_build_object('role', r.role_code, 'scope', r.scope_key))
                                         from public.user_app_roles r where r.user_id = v_uid and r.app_code = a.code and r.revoked_at is null), '[]'::jsonb)
                                      else '[]'::jsonb end)
                       order by a.sort_order, a.code)
                     from public.apps a where a.is_active), '[]'::jsonb)
  );
end $$;

revoke execute on function public.admin_set_app_role(uuid, text, text, boolean, text, text), public.admin_set_app_lifecycle(text, text, text) from public, anon;
grant execute on function public.admin_set_app_role(uuid, text, text, boolean, text, text), public.admin_set_app_lifecycle(text, text, text) to authenticated;
revoke execute on all functions in schema private from public;
grant execute on function
  private.current_aal(), private.is_active_user(uuid), private.has_role(text, uuid), private.is_super_admin(uuid),
  private.is_admin(uuid), private.holds_admin_role(uuid), private.can_manage_user(uuid, uuid),
  private.has_app_access(text, uuid), private.is_assigned_mentor(uuid, uuid),
  private.has_app_role(text, text, text, uuid), private.all_https_origins(text[])
to authenticated, service_role;
