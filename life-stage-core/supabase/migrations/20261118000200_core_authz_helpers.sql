-- =====================================================================
-- LIFE STAGE COMMON CORE  |  0002 authorization helpers
-- 権限判定はすべて「その時点のDB状態」で行う（JWT内の古い権限情報は使わない）。
-- 例外：認証強度 aal は Supabase Auth が署名した JWT の aal クレームを参照する
--       （利用者が改変できない、サーバー発行の値）。
-- =====================================================================

grant usage on schema private to authenticated, service_role;

-- 現在の認証強度（aal1 / aal2）
create or replace function private.current_aal() returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal', 'aal1')
$$;

-- 有効な利用者か（招待受諾済み かつ status=active）
create or replace function private.is_active_user(p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_uid is not null and exists (
    select 1 from public.profiles p where p.id = p_uid and p.status = 'active'
  )
$$;

-- 有効な管理ロールを持つか（本人が active であることが前提）
create or replace function private.has_role(p_role text, p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_user(p_uid) and exists (
    select 1 from public.admin_roles r
    where r.user_id = p_uid and r.role = p_role and r.revoked_at is null
  )
$$;

create or replace function private.is_super_admin(p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('super_admin', p_uid)
$$;

create or replace function private.is_admin(p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('super_admin', p_uid) or private.has_role('admin', p_uid)
$$;

-- 対象者が何らかの管理ロール（super_admin/admin）を持つか（状態不問）
create or replace function private.holds_admin_role(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_roles r
    where r.user_id = p_uid and r.role in ('super_admin','admin') and r.revoked_at is null
  )
$$;

-- 実行者が対象利用者を管理できるか
--   Super Admin : 全員（自分自身を除く操作の可否は各RPCで判定）
--   Admin       : 担当範囲(admin_user_scopes)の利用者のみ。他の管理者は対象外
create or replace function private.can_manage_user(p_target uuid, p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when private.is_super_admin(p_uid) then true
    when private.has_role('admin', p_uid) then
      not private.holds_admin_role(p_target)
      and exists (
        select 1 from public.admin_user_scopes s
        where s.admin_id = p_uid and s.user_id = p_target and s.revoked_at is null
      )
    else false
  end
$$;

-- アプリ利用可否：active 利用者 ＋ 該当アプリの active 権限 ＋ アプリ自体が有効
create or replace function private.has_app_access(p_app text, p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_user(p_uid) and exists (
    select 1
    from public.app_entitlements e
    join public.apps a on a.code = e.app_code
    where e.user_id = p_uid and e.app_code = p_app and e.status = 'active' and a.is_active
  )
$$;

-- 有効なメンター等の担当関係があるか
create or replace function private.is_assigned_mentor(p_mentor uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.mentor_assignments m
    where m.mentor_id = p_mentor and m.user_id = p_user
      and m.active_from <= now() and (m.active_to is null or m.active_to > now())
  )
$$;

-- 設定値の取得
create or replace function private.setting(p_key text, p_default jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.value from public.app_settings s where s.key = p_key), p_default)
$$;

-- 監査ログ書き込み（唯一の書き込み経路）
create or replace function private.audit(
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_target_user uuid default null,
  p_app text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null,
  p_success boolean default true
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs(actor_id, actor_aal, action, target_type, target_id, target_user_id,
                                app_code, before_state, after_state, reason, success)
  values (auth.uid(), private.current_aal(), p_action, p_target_type, p_target_id, p_target_user,
          p_app, p_before, p_after, left(p_reason, 1000), p_success)
$$;

-- エラー送出（コードは英大文字。アプリ側で日本語メッセージに変換）
create or replace function private.fail(p_code text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception '%', p_code using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------
-- 管理者操作の前提チェック
--   ・実行者が active な Admin/Super Admin
--   ・require_admin_mfa=true の場合は aal2（MFA検証済みセッション）
-- ---------------------------------------------------------------------
create or replace function private.require_admin(p_super_only boolean default false) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then perform private.fail('NOT_AUTHENTICATED'); end if;
  if p_super_only then
    if not private.is_super_admin(v_uid) then perform private.fail('FORBIDDEN'); end if;
  elsif not private.is_admin(v_uid) then
    perform private.fail('FORBIDDEN');
  end if;
  if (private.setting('require_admin_mfa', 'true'::jsonb))::text = 'true'
     and private.current_aal() <> 'aal2' then
    perform private.fail('MFA_REQUIRED');
  end if;
  return v_uid;
end $$;

-- 利用者操作の前提チェック（active であること）
create or replace function private.require_active_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then perform private.fail('NOT_AUTHENTICATED'); end if;
  if not private.is_active_user(v_uid) then perform private.fail('ACCOUNT_NOT_ACTIVE'); end if;
  return v_uid;
end $$;

-- 招待トークンのハッシュ
create or replace function private.hash_token(p_token text) returns bytea
language sql immutable set search_path = '' as $$
  select extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
$$;

-- 推測困難な招待トークン（256bit、base64url）
create or replace function private.new_token() returns text
language sql volatile set search_path = '' as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_')
$$;

-- 関数の実行権限：既定の PUBLIC 実行権限を外し、ポリシーで使うものだけ許可
revoke execute on all functions in schema private from public;
grant execute on function
  private.current_aal(),
  private.is_active_user(uuid),
  private.has_role(text, uuid),
  private.is_super_admin(uuid),
  private.is_admin(uuid),
  private.holds_admin_role(uuid),
  private.can_manage_user(uuid, uuid),
  private.has_app_access(text, uuid),
  private.is_assigned_mentor(uuid, uuid)
to authenticated, service_role;
