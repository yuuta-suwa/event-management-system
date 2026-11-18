-- =====================================================================
-- LIFE STAGE COMMON CORE  |  0004 admin RPC
-- すべて SECURITY DEFINER。冒頭で private.require_admin() により
-- 「active な管理者」かつ「MFA(aal2)」を検証し、操作を監査記録する。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 招待発行：生トークンは戻り値でのみ返し、DBにはハッシュだけを保存する
-- ---------------------------------------------------------------------
create or replace function private.create_invitation(
  p_uid uuid,
  p_email text,
  p_apps text[],
  p_grant_role text,
  p_note text,
  p_ttl_hours integer,
  p_reissued_from uuid
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid     uuid := p_uid;
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_apps    text[] := coalesce((select array_agg(distinct a) from unnest(coalesce(p_apps, '{}')) a where a is not null), '{}');
  v_ttl     integer := coalesce(p_ttl_hours, (private.setting('invitation_ttl_hours', '72'::jsonb))::text::integer);
  v_token   text := private.new_token();
  v_id      uuid;
  v_expires timestamptz;
  v_bad     text;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then perform private.fail('INVALID_EMAIL'); end if;
  if v_ttl < 1 or v_ttl > 168 then perform private.fail('INVALID_TTL'); end if;
  if p_grant_role is not null then
    if p_grant_role not in ('super_admin','admin','mentor') then perform private.fail('INVALID_ROLE'); end if;
    -- 管理ロール付き招待は Super Admin のみ（権限昇格防止）
    if not private.is_super_admin(v_uid) then perform private.fail('FORBIDDEN'); end if;
  end if;
  if cardinality(v_apps) = 0 and p_grant_role is null then perform private.fail('NO_APPS_SELECTED'); end if;
  select a into v_bad from unnest(v_apps) a
    where not exists (select 1 from public.apps x where x.code = a and x.is_active) limit 1;
  if v_bad is not null then perform private.fail('INVALID_APP'); end if;
  if exists (select 1 from public.profiles p where p.email = v_email) then perform private.fail('ALREADY_MEMBER'); end if;
  if exists (select 1 from public.invitations i where i.email = v_email and i.status = 'pending' and i.expires_at > now()) then
    perform private.fail('PENDING_INVITATION_EXISTS');
  end if;
  -- 期限切れの pending は superseded にしてから新規発行（一意制約の維持）
  update public.invitations set status = 'superseded'
    where email = v_email and status = 'pending' and expires_at <= now();

  v_expires := now() + make_interval(hours => v_ttl);
  insert into public.invitations(email, token_hash, grant_admin_role, expires_at, invited_by, note, reissued_from)
    values (v_email, private.hash_token(v_token), p_grant_role, v_expires, v_uid, nullif(trim(p_note), ''), p_reissued_from)
    returning id into v_id;
  insert into public.invitation_apps(invitation_id, app_code) select v_id, a from unnest(v_apps) a;

  perform private.audit(case when p_reissued_from is null then 'invitation.create' else 'invitation.reissue' end,
    'invitation', v_id::text, null, null, null,
    jsonb_build_object('email', v_email, 'apps', to_jsonb(v_apps), 'grant_admin_role', p_grant_role,
                       'expires_at', v_expires, 'reissued_from', p_reissued_from));
  return jsonb_build_object('invitation_id', v_id, 'token', v_token, 'email', v_email,
                            'apps', to_jsonb(v_apps), 'expires_at', v_expires);
end $$;

create or replace function public.admin_create_invitation(
  p_email text,
  p_apps text[],
  p_grant_role text default null,
  p_note text default null,
  p_ttl_hours integer default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  return private.create_invitation(private.require_admin(), p_email, p_apps, p_grant_role, p_note, p_ttl_hours, null);
end $$;

-- 招待を管理できるか（Super Admin は全件、Admin は自分が発行したもの）
create or replace function private.can_manage_invitation(p_inv public.invitations, p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_super_admin(p_uid) or (private.is_admin(p_uid) and p_inv.invited_by = p_uid)
$$;

-- ---------------------------------------------------------------------
-- 招待取り消し
-- ---------------------------------------------------------------------
create or replace function public.admin_revoke_invitation(p_invitation_id uuid, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations where id = p_invitation_id for update;
  if not found or not private.can_manage_invitation(v_inv, v_uid) then perform private.fail('NOT_FOUND'); end if;
  if v_inv.status <> 'pending' then perform private.fail('INVITATION_NOT_PENDING'); end if;
  update public.invitations
     set status = 'revoked', revoked_at = now(), revoked_by = v_uid, revoke_reason = nullif(trim(p_reason), '')
   where id = v_inv.id;
  perform private.audit('invitation.revoke', 'invitation', v_inv.id::text, null, null,
    jsonb_build_object('status', v_inv.status), jsonb_build_object('status', 'revoked'), p_reason);
  return jsonb_build_object('invitation_id', v_inv.id, 'status', 'revoked');
end $$;

-- ---------------------------------------------------------------------
-- 招待再発行：旧招待を superseded にして同条件で新トークンを発行
-- ---------------------------------------------------------------------
create or replace function public.admin_reissue_invitation(p_invitation_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := private.require_admin();
  v_inv  public.invitations;
  v_apps text[];
begin
  select * into v_inv from public.invitations where id = p_invitation_id for update;
  if not found or not private.can_manage_invitation(v_inv, v_uid) then perform private.fail('NOT_FOUND'); end if;
  if v_inv.status = 'accepted' then perform private.fail('INVITATION_ALREADY_ACCEPTED'); end if;
  if v_inv.status = 'superseded' then perform private.fail('INVITATION_SUPERSEDED'); end if;
  select coalesce(array_agg(app_code order by app_code), '{}') into v_apps
    from public.invitation_apps where invitation_id = v_inv.id;
  update public.invitations set status = 'superseded' where id = v_inv.id;
  return private.create_invitation(v_uid, v_inv.email, v_apps, v_inv.grant_admin_role, v_inv.note, null, v_inv.id);
end $$;

-- ---------------------------------------------------------------------
-- アプリ別権限の付与・取り消し
-- ---------------------------------------------------------------------
create or replace function public.admin_set_entitlement(p_user_id uuid, p_app_code text, p_grant boolean, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_admin();
  v_before public.app_entitlements;
begin
  if not private.can_manage_user(p_user_id, v_uid) then perform private.fail('FORBIDDEN'); end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then perform private.fail('NOT_FOUND'); end if;
  if p_grant and not exists (select 1 from public.apps where code = p_app_code and is_active) then perform private.fail('INVALID_APP'); end if;
  select * into v_before from public.app_entitlements where user_id = p_user_id and app_code = p_app_code for update;

  if p_grant then
    insert into public.app_entitlements(user_id, app_code, status, granted_by, granted_at, reason)
      values (p_user_id, p_app_code, 'active', v_uid, now(), p_reason)
    on conflict (user_id, app_code) do update
      set status = 'active', granted_by = v_uid, granted_at = now(), revoked_by = null, revoked_at = null, reason = p_reason
      where public.app_entitlements.status <> 'active';
  else
    if v_before.id is null or v_before.status = 'revoked' then
      return jsonb_build_object('user_id', p_user_id, 'app_code', p_app_code, 'status', 'revoked', 'changed', false);
    end if;
    update public.app_entitlements
       set status = 'revoked', revoked_by = v_uid, revoked_at = now(), reason = p_reason
     where id = v_before.id;
  end if;

  perform private.audit(case when p_grant then 'entitlement.grant' else 'entitlement.revoke' end,
    'app_entitlement', p_app_code, p_user_id, p_app_code,
    case when v_before.id is null then null else jsonb_build_object('status', v_before.status) end,
    jsonb_build_object('status', case when p_grant then 'active' else 'revoked' end), p_reason);
  return jsonb_build_object('user_id', p_user_id, 'app_code', p_app_code,
                            'status', case when p_grant then 'active' else 'revoked' end, 'changed', true);
end $$;

-- ---------------------------------------------------------------------
-- 利用状態の変更：suspend（一時停止）/ resume（再開）/ revoke（利用権剥奪）
-- データは保持する。停止時はリフレッシュトークンを失効させ、
-- 以後はDB側の判定で既存アクセストークンも全拒否される。
-- ---------------------------------------------------------------------
create or replace function public.admin_set_user_status(p_user_id uuid, p_action text, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid    uuid := private.require_admin();
  v_prof   public.profiles;
  v_new    text;
begin
  if p_user_id = v_uid then perform private.fail('CANNOT_TARGET_SELF'); end if;
  if not private.can_manage_user(p_user_id, v_uid) then perform private.fail('FORBIDDEN'); end if;
  select * into v_prof from public.profiles where id = p_user_id for update;
  if not found then perform private.fail('NOT_FOUND'); end if;

  v_new := case p_action
    when 'suspend' then case when v_prof.status = 'active' then 'suspended' end
    when 'resume'  then case when v_prof.status in ('suspended','revoked') then 'active' end
    when 'revoke'  then case when v_prof.status in ('active','suspended') then 'revoked' end
  end;
  if p_action not in ('suspend','resume','revoke') then perform private.fail('INVALID_ACTION'); end if;
  if v_new is null then perform private.fail('INVALID_STATUS_TRANSITION'); end if;

  -- 最後の有効な Super Admin は停止できない
  if v_new <> 'active' and private.has_role('super_admin', p_user_id)
     and (select count(*) from public.admin_roles r join public.profiles p on p.id = r.user_id
           where r.role = 'super_admin' and r.revoked_at is null and p.status = 'active') <= 1 then
    perform private.fail('LAST_SUPER_ADMIN');
  end if;

  update public.profiles
     set status = v_new, status_reason = nullif(trim(p_reason), ''), status_changed_at = now(), status_changed_by = v_uid
   where id = p_user_id;

  if v_new <> 'active' then
    perform private.revoke_sessions(p_user_id);
  end if;

  perform private.audit('user.' || p_action, 'profile', p_user_id::text, p_user_id, null,
    jsonb_build_object('status', v_prof.status), jsonb_build_object('status', v_new), p_reason);
  return jsonb_build_object('user_id', p_user_id, 'status', v_new);
end $$;

-- セッション（リフレッシュトークン）失効。auth スキーマ構成が異なる環境でも失敗させない
create or replace function private.revoke_sessions(p_user_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  begin
    delete from auth.sessions where user_id = p_user_id;
  exception when undefined_table or insufficient_privilege then
    raise warning 'auth.sessions not available; relying on DB-side status checks';
  end;
end $$;

-- ---------------------------------------------------------------------
-- 管理ロールの付与・取り消し（Super Admin のみ。自分自身のロールは変更不可）
-- ---------------------------------------------------------------------
create or replace function public.admin_set_role(p_user_id uuid, p_role text, p_grant boolean, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin(true);
  v_has boolean;
begin
  if p_role not in ('super_admin','admin','mentor') then perform private.fail('INVALID_ROLE'); end if;
  if p_user_id = v_uid then perform private.fail('CANNOT_TARGET_SELF'); end if;
  if not exists (select 1 from public.profiles where id = p_user_id and status = 'active') then
    perform private.fail('TARGET_NOT_ACTIVE');
  end if;
  v_has := exists (select 1 from public.admin_roles where user_id = p_user_id and role = p_role and revoked_at is null);

  if p_grant and not v_has then
    insert into public.admin_roles(user_id, role, granted_by, reason) values (p_user_id, p_role, v_uid, p_reason);
  elsif not p_grant and v_has then
    update public.admin_roles set revoked_at = now(), revoked_by = v_uid, reason = p_reason
     where user_id = p_user_id and role = p_role and revoked_at is null;
    if p_role = 'admin' then
      update public.admin_user_scopes set revoked_at = now() where admin_id = p_user_id and revoked_at is null;
    end if;
    if p_role = 'mentor' then
      update public.mentor_assignments set active_to = now()
       where mentor_id = p_user_id and (active_to is null or active_to > now());
      update public.data_shares set status = 'revoked', revoked_at = now()
       where grantee_id = p_user_id and status = 'active';
    end if;
  else
    return jsonb_build_object('user_id', p_user_id, 'role', p_role, 'granted', p_grant, 'changed', false);
  end if;

  perform private.audit(case when p_grant then 'role.grant' else 'role.revoke' end,
    'admin_role', p_role, p_user_id, null,
    jsonb_build_object('has_role', v_has), jsonb_build_object('has_role', p_grant), p_reason);
  return jsonb_build_object('user_id', p_user_id, 'role', p_role, 'granted', p_grant, 'changed', true);
end $$;

-- ---------------------------------------------------------------------
-- Admin の担当範囲（Super Admin のみ）
-- ---------------------------------------------------------------------
create or replace function public.admin_set_scope(p_admin_id uuid, p_user_id uuid, p_assign boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin(true);
begin
  if not private.has_role('admin', p_admin_id) then perform private.fail('TARGET_NOT_ADMIN'); end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then perform private.fail('NOT_FOUND'); end if;
  if private.holds_admin_role(p_user_id) then perform private.fail('CANNOT_SCOPE_ADMIN'); end if;
  if p_assign then
    insert into public.admin_user_scopes(admin_id, user_id, assigned_by) values (p_admin_id, p_user_id, v_uid)
      on conflict (admin_id, user_id) where revoked_at is null do nothing;
  else
    update public.admin_user_scopes set revoked_at = now()
     where admin_id = p_admin_id and user_id = p_user_id and revoked_at is null;
  end if;
  perform private.audit(case when p_assign then 'scope.assign' else 'scope.unassign' end,
    'admin_user_scope', p_admin_id::text, p_user_id, null, null,
    jsonb_build_object('admin_id', p_admin_id, 'assigned', p_assign));
  return jsonb_build_object('admin_id', p_admin_id, 'user_id', p_user_id, 'assigned', p_assign);
end $$;

-- ---------------------------------------------------------------------
-- メンター等の担当（Super Admin、または対象利用者を担当する Admin）
-- 担当解除時は、その担当者への共有を自動的に閲覧不可にする（RLSで判定）
-- ---------------------------------------------------------------------
create or replace function public.admin_set_mentor_assignment(p_mentor_id uuid, p_user_id uuid, p_relation text, p_assign boolean)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
begin
  if p_relation not in ('mentor','trainer','leader') then perform private.fail('INVALID_RELATION'); end if;
  if not private.can_manage_user(p_user_id, v_uid) then perform private.fail('FORBIDDEN'); end if;
  if p_assign and not private.has_role('mentor', p_mentor_id) then perform private.fail('TARGET_NOT_MENTOR'); end if;
  if p_mentor_id = p_user_id then perform private.fail('CANNOT_TARGET_SELF'); end if;
  if p_assign then
    insert into public.mentor_assignments(mentor_id, user_id, relation, assigned_by)
      values (p_mentor_id, p_user_id, p_relation, v_uid)
      on conflict (mentor_id, user_id, relation) where active_to is null do nothing;
  else
    update public.mentor_assignments set active_to = now()
     where mentor_id = p_mentor_id and user_id = p_user_id and relation = p_relation and active_to is null;
    -- 担当関係が無くなった場合は、その担当者への共有を撤回（再担当時に過去の共有を復活させない）
    if not private.is_assigned_mentor(p_mentor_id, p_user_id) then
      update public.data_shares set status = 'revoked', revoked_at = now()
       where owner_id = p_user_id and grantee_id = p_mentor_id and status = 'active';
    end if;
  end if;
  perform private.audit(case when p_assign then 'mentor.assign' else 'mentor.unassign' end,
    'mentor_assignment', p_mentor_id::text, p_user_id, null, null,
    jsonb_build_object('mentor_id', p_mentor_id, 'relation', p_relation, 'assigned', p_assign));
  return jsonb_build_object('mentor_id', p_mentor_id, 'user_id', p_user_id, 'relation', p_relation, 'assigned', p_assign);
end $$;

-- ---------------------------------------------------------------------
-- 利用者一覧（運用情報のみ。各アプリの個人データは含めない）
-- ---------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_search text default null, p_status text default null, p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_q   text := nullif(lower(trim(coalesce(p_search, ''))), '');
  v_res jsonb;
  v_total bigint;
begin
  with visible as (
    select p.* from public.profiles p
    where p.id <> v_uid and private.can_manage_user(p.id, v_uid)
      and (p_status is null or p.status = p_status)
      and (v_q is null or position(v_q in p.email) > 0 or position(v_q in lower(p.display_name)) > 0)
  )
  select (select count(*) from visible),
         coalesce(jsonb_agg(row_to_json(u) order by u.created_at desc), '[]'::jsonb)
    into v_total, v_res
  from (
    select v.id, v.email, v.display_name, v.status, v.status_reason, v.status_changed_at, v.created_at,
      coalesce((select jsonb_agg(e.app_code order by e.app_code) from public.app_entitlements e
                 where e.user_id = v.id and e.status = 'active'), '[]'::jsonb) as apps,
      coalesce((select jsonb_agg(r.role order by r.role) from public.admin_roles r
                 where r.user_id = v.id and r.revoked_at is null), '[]'::jsonb) as roles
    from visible v
    order by v.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) u;
  return jsonb_build_object('total', v_total, 'users', v_res);
end $$;

-- ---------------------------------------------------------------------
-- ダッシュボード KPI（担当範囲内の集計）
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_super boolean := private.is_super_admin(v_uid);
begin
  return (
    with scope as (select p.* from public.profiles p where private.can_manage_user(p.id, v_uid) or p.id = v_uid)
    select jsonb_build_object(
      'users_active',    (select count(*) from scope where status = 'active'),
      'users_suspended', (select count(*) from scope where status = 'suspended'),
      'users_revoked',   (select count(*) from scope where status = 'revoked'),
      'users_deletion_pending', (select count(*) from scope where status = 'deletion_pending'),
      'invitations_pending', (select count(*) from public.invitations i
                               where i.status = 'pending' and i.expires_at > now() and (v_super or i.invited_by = v_uid)),
      'invitations_expired', (select count(*) from public.invitations i
                               where i.status = 'pending' and i.expires_at <= now() and (v_super or i.invited_by = v_uid)),
      'entitlements_by_app', coalesce((select jsonb_object_agg(a.code, (
                                 select count(*) from public.app_entitlements e join scope s on s.id = e.user_id
                                  where e.app_code = a.code and e.status = 'active'))
                               from public.apps a), '{}'::jsonb),
      'transfers_succeeded', (select count(*) from public.data_transfers t join scope s on s.id = t.user_id where t.status = 'succeeded'),
      'transfers_failed',    (select count(*) from public.data_transfers t join scope s on s.id = t.user_id where t.status = 'failed'),
      'audit_failures_24h',  (select count(*) from public.audit_logs l
                               where l.success = false and l.occurred_at > now() - interval '24 hours'
                                 and (v_super or l.actor_id = v_uid or (l.target_user_id is not null and private.can_manage_user(l.target_user_id, v_uid))))
    )
  );
end $$;

-- ---------------------------------------------------------------------
-- 設定変更（Super Admin のみ。許可キーのみ）
-- ---------------------------------------------------------------------
create or replace function public.admin_update_setting(p_key text, p_value jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin(true);
  v_before jsonb;
begin
  if p_key = 'invitation_ttl_hours' then
    if jsonb_typeof(p_value) <> 'number' or (p_value::text)::numeric not between 1 and 168 then perform private.fail('INVALID_SETTING'); end if;
  elsif p_key = 'require_admin_mfa' then
    -- MFA要求は無効化できない（試験運用・本番とも必須）。開発DBでのみSQLで変更する
    if p_value <> 'true'::jsonb then perform private.fail('SETTING_LOCKED'); end if;
  else
    perform private.fail('INVALID_SETTING');
  end if;
  select value into v_before from public.app_settings where key = p_key;
  insert into public.app_settings(key, value, updated_by, updated_at) values (p_key, p_value, v_uid, now())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  perform private.audit('setting.update', 'app_setting', p_key, null, null,
    jsonb_build_object('value', v_before), jsonb_build_object('value', p_value));
  return jsonb_build_object('key', p_key, 'value', p_value);
end $$;

-- ---------------------------------------------------------------------
-- アカウント削除手続き（管理者による申請 / Super Admin による確認・取消）
-- 確認後は status=deletion_pending（アクセス遮断）。物理削除は運用手順で実施。
-- ---------------------------------------------------------------------
create or replace function public.admin_request_deletion(p_user_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_id  uuid;
begin
  if p_user_id = v_uid then perform private.fail('CANNOT_TARGET_SELF'); end if;
  if not private.can_manage_user(p_user_id, v_uid) then perform private.fail('FORBIDDEN'); end if;
  if coalesce(trim(p_reason), '') = '' then perform private.fail('REASON_REQUIRED'); end if;
  if exists (select 1 from public.deletion_requests where user_id = p_user_id and status in ('requested','confirmed')) then
    perform private.fail('DELETION_ALREADY_REQUESTED');
  end if;
  insert into public.deletion_requests(user_id, requested_by, source, reason)
    values (p_user_id, v_uid, 'admin', p_reason) returning id into v_id;
  perform private.audit('deletion.request', 'deletion_request', v_id::text, p_user_id, null, null,
    jsonb_build_object('source', 'admin'), p_reason);
  return jsonb_build_object('request_id', v_id, 'status', 'requested');
end $$;

create or replace function public.admin_decide_deletion(p_request_id uuid, p_decision text, p_confirm_email text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid  uuid := private.require_admin(true);
  v_req  public.deletion_requests;
  v_prof public.profiles;
begin
  select * into v_req from public.deletion_requests where id = p_request_id for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  select * into v_prof from public.profiles where id = v_req.user_id for update;

  if p_decision = 'confirm' then
    if v_req.status <> 'requested' then perform private.fail('INVALID_STATUS_TRANSITION'); end if;
    -- 二段階確認：対象メールアドレスの再入力が一致すること
    if lower(trim(coalesce(p_confirm_email, ''))) <> v_prof.email then perform private.fail('CONFIRMATION_MISMATCH'); end if;
    if private.has_role('super_admin', v_req.user_id) then perform private.fail('CANNOT_DELETE_SUPER_ADMIN'); end if;
    update public.deletion_requests set status = 'confirmed', confirmed_by = v_uid, confirmed_at = now(),
           previous_status = v_prof.status where id = v_req.id;
    update public.profiles set status = 'deletion_pending', status_changed_at = now(), status_changed_by = v_uid,
           status_reason = 'deletion confirmed' where id = v_req.user_id;
    perform private.revoke_sessions(v_req.user_id);
  elsif p_decision = 'cancel' then
    if v_req.status not in ('requested','confirmed') then perform private.fail('INVALID_STATUS_TRANSITION'); end if;
    update public.deletion_requests set status = 'cancelled', cancelled_at = now() where id = v_req.id;
    if v_req.status = 'confirmed' then
      update public.profiles set status = coalesce(v_req.previous_status, 'suspended'), status_changed_at = now(),
             status_changed_by = v_uid, status_reason = 'deletion cancelled' where id = v_req.user_id;
    end if;
  else
    perform private.fail('INVALID_ACTION');
  end if;
  perform private.audit('deletion.' || p_decision, 'deletion_request', v_req.id::text, v_req.user_id, null,
    jsonb_build_object('status', v_req.status, 'profile_status', v_prof.status),
    jsonb_build_object('decision', p_decision));
  return jsonb_build_object('request_id', v_req.id, 'decision', p_decision);
end $$;

-- ---------------------------------------------------------------------
-- 初期 Super Admin の作成（SQL Editor / service_role 専用。APIからは実行不可）
-- 戻り値の token で /invite?token=... にアクセスし、該当Googleアカウントで受諾する
-- ---------------------------------------------------------------------
create or replace function private.bootstrap_super_admin(p_email text, p_ttl_hours integer default 24) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_token text := private.new_token();
  v_id    uuid;
begin
  if exists (select 1 from public.admin_roles r join public.profiles p on p.id = r.user_id
             where r.role = 'super_admin' and r.revoked_at is null and p.status = 'active') then
    perform private.fail('SUPER_ADMIN_EXISTS');
  end if;
  update public.invitations set status = 'superseded' where email = v_email and status = 'pending';
  insert into public.invitations(email, token_hash, grant_admin_role, expires_at, note)
    values (v_email, private.hash_token(v_token), 'super_admin', now() + make_interval(hours => p_ttl_hours), 'bootstrap')
    returning id into v_id;
  insert into public.audit_logs(action, target_type, target_id, after_state)
    values ('invitation.bootstrap', 'invitation', v_id::text, jsonb_build_object('email', v_email));
  return jsonb_build_object('invitation_id', v_id, 'token', v_token);
end $$;
revoke execute on function private.bootstrap_super_admin(text, integer) from public, authenticated;
grant execute on function private.bootstrap_super_admin(text, integer) to service_role;

-- 実行権限：公開RPCは authenticated のみ（anon は不可）
revoke execute on function
  public.admin_create_invitation(text, text[], text, text, integer),
  public.admin_revoke_invitation(uuid, text),
  public.admin_reissue_invitation(uuid),
  public.admin_set_entitlement(uuid, text, boolean, text),
  public.admin_set_user_status(uuid, text, text),
  public.admin_set_role(uuid, text, boolean, text),
  public.admin_set_scope(uuid, uuid, boolean),
  public.admin_set_mentor_assignment(uuid, uuid, text, boolean),
  public.admin_list_users(text, text, integer, integer),
  public.admin_dashboard_stats(),
  public.admin_update_setting(text, jsonb),
  public.admin_request_deletion(uuid, text),
  public.admin_decide_deletion(uuid, text, text)
from public, anon;
grant execute on function
  public.admin_create_invitation(text, text[], text, text, integer),
  public.admin_revoke_invitation(uuid, text),
  public.admin_reissue_invitation(uuid),
  public.admin_set_entitlement(uuid, text, boolean, text),
  public.admin_set_user_status(uuid, text, text),
  public.admin_set_role(uuid, text, boolean, text),
  public.admin_set_scope(uuid, uuid, boolean),
  public.admin_set_mentor_assignment(uuid, uuid, text, boolean),
  public.admin_list_users(text, text, integer, integer),
  public.admin_dashboard_stats(),
  public.admin_update_setting(text, jsonb),
  public.admin_request_deletion(uuid, text),
  public.admin_decide_deletion(uuid, text, text)
to authenticated;
revoke execute on all functions in schema private from public;
