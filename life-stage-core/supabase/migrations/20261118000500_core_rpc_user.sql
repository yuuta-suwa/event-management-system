-- =====================================================================
-- LIFE STAGE COMMON CORE  |  0005 user RPC（招待受諾・本人操作・共有・連携転送）
-- user_id は引数で受け取らず、常に auth.uid()（認証コンテキスト）から導出する。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 現在のアクセス状態（全保護画面・APIの判定起点）
-- ---------------------------------------------------------------------
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
                         'code', a.code, 'name_en', a.name_en, 'name_ja', a.name_ja,
                         'granted', v_active and exists (select 1 from public.app_entitlements e
                                         where e.user_id = v_uid and e.app_code = a.code and e.status = 'active'))
                       order by a.sort_order, a.code)
                     from public.apps a where a.is_active), '[]'::jsonb)
  );
end $$;

-- アプリ単位の判定（各APPのサーバーが利用）
create or replace function public.check_app_access(p_app_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_app_access(p_app_code)
$$;

-- ---------------------------------------------------------------------
-- 招待受諾：認証済みメールと招待先を照合し、原子的に消費＋権限付与
--  * 招待行を FOR UPDATE でロック → 同時実行・二重実行でも1回だけ成功
--  * 失敗は例外ではなく結果を返し、試行を監査ログに残す
-- ---------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_user     record;
  v_inv      public.invitations;
  v_prof     public.profiles;
  v_code     text;
  v_apps     text[];
  v_failures integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;

  -- 総当たり対策：直近1時間の失敗が10回以上なら拒否
  select count(*) into v_failures from public.audit_logs
   where actor_id = v_uid and action = 'invitation.accept' and success = false
     and occurred_at > now() - interval '1 hour';
  if v_failures >= 10 then return jsonb_build_object('ok', false, 'code', 'TOO_MANY_ATTEMPTS'); end if;

  select u.id, lower(u.email) as email, u.email_confirmed_at,
         exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google') as has_google
    into v_user from auth.users u where u.id = v_uid;

  select * into v_inv from public.invitations
   where token_hash = private.hash_token(coalesce(p_token, '')) for update;

  v_code := case
    when v_user.id is null or v_user.email_confirmed_at is null then 'EMAIL_NOT_VERIFIED'
    when not v_user.has_google then 'PROVIDER_NOT_ALLOWED'
    when v_inv.id is null then 'INVITATION_INVALID'
    when v_inv.status = 'accepted' then 'INVITATION_USED'
    when v_inv.status = 'revoked' then 'INVITATION_REVOKED'
    when v_inv.status = 'superseded' then 'INVITATION_SUPERSEDED'
    when v_inv.expires_at <= now() then 'INVITATION_EXPIRED'
    when v_inv.email <> v_user.email then 'EMAIL_MISMATCH'
  end;

  if v_code is null then
    select * into v_prof from public.profiles where id = v_uid for update;
    if found and v_prof.status in ('suspended','deletion_pending','deleted') then
      v_code := 'ACCOUNT_NOT_ELIGIBLE';  -- 停止中の利用者が新しい招待で停止を回避することを防ぐ
    elsif found and v_prof.status = 'active' then
      v_code := 'ALREADY_MEMBER';
    end if;
  end if;

  if v_code is not null then
    perform private.audit('invitation.accept', 'invitation', v_inv.id::text, v_uid, null, null,
      jsonb_build_object('code', v_code), null, false);
    return jsonb_build_object('ok', false, 'code', v_code);
  end if;

  -- 消費（ステータス条件付き更新で二重消費を防止）
  update public.invitations set status = 'accepted', accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id and status = 'pending';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVITATION_USED');
  end if;

  insert into public.profiles(id, email, status, status_changed_at)
    values (v_uid, v_user.email, 'active', now())
  on conflict (id) do update set status = 'active', status_changed_at = now(), status_reason = null,
                                 email = excluded.email;

  select coalesce(array_agg(ia.app_code), '{}') into v_apps
    from public.invitation_apps ia join public.apps a on a.code = ia.app_code and a.is_active
   where ia.invitation_id = v_inv.id;

  insert into public.app_entitlements(user_id, app_code, status, granted_by, granted_at, reason)
    select v_uid, a, 'active', v_inv.invited_by, now(), 'invitation' from unnest(v_apps) a
  on conflict (user_id, app_code) do update
    set status = 'active', granted_by = excluded.granted_by, granted_at = now(), revoked_at = null, revoked_by = null,
        reason = 'invitation'
    where public.app_entitlements.status <> 'active';

  if v_inv.grant_admin_role is not null then
    insert into public.admin_roles(user_id, role, granted_by, reason)
      values (v_uid, v_inv.grant_admin_role, v_inv.invited_by, 'invitation')
      on conflict (user_id, role) where revoked_at is null do nothing;
  end if;

  -- Admin が招待した利用者は、その Admin の担当範囲に入る
  if v_inv.invited_by is not null and v_inv.grant_admin_role is null
     and private.has_role('admin', v_inv.invited_by) and not private.has_role('super_admin', v_inv.invited_by) then
    insert into public.admin_user_scopes(admin_id, user_id, assigned_by)
      values (v_inv.invited_by, v_uid, v_inv.invited_by)
      on conflict (admin_id, user_id) where revoked_at is null do nothing;
  end if;

  perform private.audit('invitation.accept', 'invitation', v_inv.id::text, v_uid, null, null,
    jsonb_build_object('apps', to_jsonb(v_apps), 'grant_admin_role', v_inv.grant_admin_role));
  return jsonb_build_object('ok', true, 'code', 'ACCEPTED', 'apps', to_jsonb(v_apps),
                            'grant_admin_role', v_inv.grant_admin_role);
end $$;

-- ---------------------------------------------------------------------
-- 同意
-- ---------------------------------------------------------------------
create or replace function public.record_consent(p_consent_type text, p_consent_version text, p_app_code text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_id  uuid;
begin
  insert into public.consent_records(user_id, consent_type, consent_version, app_code)
    values (v_uid, p_consent_type, p_consent_version, p_app_code) returning id into v_id;
  perform private.audit('consent.grant', 'consent_record', v_id::text, v_uid, p_app_code, null,
    jsonb_build_object('type', p_consent_type, 'version', p_consent_version));
  return jsonb_build_object('consent_id', v_id);
end $$;

create or replace function public.withdraw_consent(p_consent_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
begin
  update public.consent_records set withdrawn_at = now()
   where id = p_consent_id and user_id = v_uid and withdrawn_at is null;
  if not found then perform private.fail('NOT_FOUND'); end if;
  perform private.audit('consent.withdraw', 'consent_record', p_consent_id::text, v_uid);
  return jsonb_build_object('consent_id', p_consent_id, 'withdrawn', true);
end $$;

-- ---------------------------------------------------------------------
-- 本人による削除請求
-- ---------------------------------------------------------------------
create or replace function public.request_own_deletion(p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_id  uuid;
begin
  if exists (select 1 from public.deletion_requests where user_id = v_uid and status in ('requested','confirmed')) then
    perform private.fail('DELETION_ALREADY_REQUESTED');
  end if;
  insert into public.deletion_requests(user_id, requested_by, source, reason)
    values (v_uid, v_uid, 'self', p_reason) returning id into v_id;
  perform private.audit('deletion.request', 'deletion_request', v_id::text, v_uid, null, null,
    jsonb_build_object('source', 'self'), p_reason);
  return jsonb_build_object('request_id', v_id, 'status', 'requested');
end $$;

create or replace function public.cancel_own_deletion() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_id  uuid;
begin
  update public.deletion_requests set status = 'cancelled', cancelled_at = now()
   where user_id = v_uid and status = 'requested' returning id into v_id;
  if v_id is null then perform private.fail('NOT_FOUND'); end if;
  perform private.audit('deletion.cancel', 'deletion_request', v_id::text, v_uid);
  return jsonb_build_object('request_id', v_id, 'status', 'cancelled');
end $$;

-- ---------------------------------------------------------------------
-- 本人データの出力（AT18）
-- ---------------------------------------------------------------------
create or replace function public.my_export() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_out jsonb;
begin
  select jsonb_build_object(
    'exported_at', now(),
    'format_version', '1.0',
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'roles', coalesce((select jsonb_agg(to_jsonb(r)) from public.admin_roles r where r.user_id = v_uid), '[]'),
    'entitlements', coalesce((select jsonb_agg(to_jsonb(e)) from public.app_entitlements e where e.user_id = v_uid), '[]'),
    'consents', coalesce((select jsonb_agg(to_jsonb(c)) from public.consent_records c where c.user_id = v_uid), '[]'),
    'mentor_assignments', coalesce((select jsonb_agg(to_jsonb(m)) from public.mentor_assignments m where m.user_id = v_uid), '[]'),
    'shares', coalesce((select jsonb_agg(to_jsonb(s)) from public.data_shares s where s.owner_id = v_uid), '[]'),
    'snapshots', coalesce((select jsonb_agg(to_jsonb(x)) from public.app_snapshots x where x.user_id = v_uid), '[]'),
    'transfers', coalesce((select jsonb_agg(to_jsonb(t)) from public.data_transfers t where t.user_id = v_uid), '[]'),
    'transfer_inbox', coalesce((select jsonb_agg(to_jsonb(i)) from public.transfer_inbox i where i.user_id = v_uid), '[]'),
    'deletion_requests', coalesce((select jsonb_agg(to_jsonb(d)) from public.deletion_requests d where d.user_id = v_uid), '[]')
  ) into v_out;
  perform private.audit('data.export', 'profile', v_uid::text, v_uid);
  return v_out;
end $$;

-- ---------------------------------------------------------------------
-- 共有（本人の明示操作のみ。共有先は有効な担当メンター等に限る）
-- ---------------------------------------------------------------------
create or replace function public.my_share_targets() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.is_active_user() then coalesce((
    select jsonb_agg(jsonb_build_object('mentor_id', m.mentor_id, 'display_name', p.display_name, 'relation', m.relation))
    from public.mentor_assignments m join public.profiles p on p.id = m.mentor_id and p.status = 'active'
    where m.user_id = auth.uid() and m.active_from <= now() and (m.active_to is null or m.active_to > now())
  ), '[]'::jsonb) else '[]'::jsonb end
$$;

create or replace function public.create_share(
  p_grantee_id uuid, p_app_code text, p_resource_type text, p_resource_id uuid default null,
  p_scope jsonb default '{}'::jsonb, p_permission text default 'read', p_expires_at timestamptz default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_id  uuid;
begin
  if not private.has_app_access(p_app_code, v_uid) then perform private.fail('APP_ACCESS_DENIED'); end if;
  if not private.is_active_user(p_grantee_id) or not private.is_assigned_mentor(p_grantee_id, v_uid) then
    perform private.fail('SHARE_TARGET_NOT_ALLOWED');
  end if;
  if p_expires_at is not null and p_expires_at <= now() then perform private.fail('INVALID_EXPIRY'); end if;
  if p_resource_type = 'app_snapshot' and not exists (
       select 1 from public.app_snapshots s where s.id = p_resource_id and s.user_id = v_uid and s.app_code = p_app_code) then
    perform private.fail('NOT_FOUND');
  end if;
  insert into public.data_shares(owner_id, grantee_id, app_code, resource_type, resource_id, scope, permission, expires_at)
    values (v_uid, p_grantee_id, p_app_code, p_resource_type, p_resource_id, coalesce(p_scope, '{}'::jsonb),
            coalesce(p_permission, 'read'), p_expires_at)
    returning id into v_id;
  perform private.audit('share.create', 'data_share', v_id::text, v_uid, p_app_code, null,
    jsonb_build_object('grantee_id', p_grantee_id, 'resource_type', p_resource_type, 'resource_id', p_resource_id,
                       'permission', p_permission, 'expires_at', p_expires_at));
  return jsonb_build_object('share_id', v_id);
end $$;

create or replace function public.revoke_share(p_share_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_app text;
begin
  update public.data_shares set status = 'revoked', revoked_at = now()
   where id = p_share_id and owner_id = v_uid and status = 'active' returning app_code into v_app;
  if v_app is null then perform private.fail('NOT_FOUND'); end if;
  perform private.audit('share.revoke', 'data_share', p_share_id::text, v_uid, v_app);
  return jsonb_build_object('share_id', p_share_id, 'status', 'revoked');
end $$;

-- ---------------------------------------------------------------------
-- 連携：確定スナップショット（APP本体未実装のため、契約検証用の登録口）
--  APP01 → life_blueprint / APP02 → growth_plan
--  新しい版を確定すると旧版は superseded、旧版からの転送は「要再確認」になる
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
  if not ((p_app_code = 'APP01' and p_snapshot_type = 'life_blueprint')
       or (p_app_code = 'APP02' and p_snapshot_type = 'growth_plan')) then
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

-- スキーマ検証。エラー文字列（null=合格）
create or replace function private.validate_transfer_payload(p_type text, p_schema text, p_payload jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_required text[];
  v_missing  text;
  v_cells    integer;
begin
  if p_schema <> '1.0' then return 'UNSUPPORTED_SCHEMA_VERSION'; end if;
  if p_type = 'life_blueprint' then
    v_required := array['blueprint_id','life_purpose','priority_desires','budget_summary','vision_board_asset_refs',
                        'gap_analysis','goals','priority_capabilities','first_action','first_action_date','consent_version'];
  elsif p_type = 'growth_plan' then
    v_required := array['plan_id','vision_version','start_year','mode','focus_abilities','cells',
                        'provisional_assessment','approved_at'];
  else
    return 'UNKNOWN_SNAPSHOT_TYPE';
  end if;
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
    -- APP02 の暫定診断は正式認定ではない：認定系フィールドの混入を拒否
    if p_payload ? 'certifications' or p_payload ? 'titles' or p_payload ? 'certified_levels' then
      return 'CERTIFICATION_FIELDS_NOT_ALLOWED';
    end if;
  end if;
  return null;
end $$;

-- 配送（転送先の受信箱へ。既存データは上書きしない）
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
    when not private.has_app_access(v_t.target_app, v_t.user_id) then 'TARGET_APP_ACCESS_DENIED'
    else private.validate_transfer_payload(v_s.snapshot_type, v_t.schema_version, v_s.payload)
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

-- 転送要求（本人承認後）
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
  if not ((v_s.app_code = 'APP01' and v_s.snapshot_type = 'life_blueprint' and p_target_app = 'APP02')
       or (v_s.app_code = 'APP02' and v_s.snapshot_type = 'growth_plan' and p_target_app = 'APP03')) then
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
    -- 冪等：同一キーの転送が既に存在する
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

create or replace function public.retry_transfer(p_transfer_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_active_user();
  v_t   public.data_transfers;
begin
  select * into v_t from public.data_transfers where id = p_transfer_id and user_id = v_uid for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  if v_t.status = 'succeeded' then
    return jsonb_build_object('transfer_id', v_t.id, 'status', 'succeeded', 'idempotent', true);
  end if;
  if v_t.attempt_count >= 10 then perform private.fail('TOO_MANY_ATTEMPTS'); end if;
  if v_t.source_superseded_at is not null then perform private.fail('SNAPSHOT_SUPERSEDED'); end if;
  return private.deliver_transfer(v_t.id);
end $$;

-- 実行権限
revoke execute on function
  public.my_access(), public.check_app_access(text), public.accept_invitation(text),
  public.record_consent(text, text, text), public.withdraw_consent(uuid),
  public.request_own_deletion(text), public.cancel_own_deletion(), public.my_export(),
  public.my_share_targets(), public.create_share(uuid, text, text, uuid, jsonb, text, timestamptz), public.revoke_share(uuid),
  public.confirm_snapshot(text, text, text, jsonb), public.request_transfer(uuid, text, text, text), public.retry_transfer(uuid)
from public, anon;
grant execute on function
  public.my_access(), public.check_app_access(text), public.accept_invitation(text),
  public.record_consent(text, text, text), public.withdraw_consent(uuid),
  public.request_own_deletion(text), public.cancel_own_deletion(), public.my_export(),
  public.my_share_targets(), public.create_share(uuid, text, text, uuid, jsonb, text, timestamptz), public.revoke_share(uuid),
  public.confirm_snapshot(text, text, text, jsonb), public.request_transfer(uuid, text, text, text), public.retry_transfer(uuid)
to authenticated;
revoke execute on all functions in schema private from public;
