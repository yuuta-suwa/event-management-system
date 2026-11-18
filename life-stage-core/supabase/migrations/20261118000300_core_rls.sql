-- =====================================================================
-- LIFE STAGE COMMON CORE  |  0003 grants & RLS
-- 方針
--  * anon には一切のテーブル権限を与えない。
--  * authenticated には必要最小限の SELECT（＋本人の表示名更新）だけを与え、
--    書き込みはすべて SECURITY DEFINER の RPC 経由（権限確認・監査込み）。
--  * すべてのポリシーで「本人が active であること」を条件にする
--    → 停止後は既存セッション（有効なJWT）でも行が一切返らない。
--  * 管理者は利用者の「運用情報」（氏名・メール・状態・権限）のみ閲覧可。
--    各アプリの個人データ（app_snapshots / transfer_inbox）は本人と明示共有先のみ。
-- =====================================================================

-- 全テーブルで RLS を有効化（FORCE は service_role/postgres の運用操作のため付けない）
alter table public.apps               enable row level security;
alter table public.profiles           enable row level security;
alter table public.admin_roles        enable row level security;
alter table public.admin_user_scopes  enable row level security;
alter table public.mentor_assignments enable row level security;
alter table public.invitations        enable row level security;
alter table public.invitation_apps    enable row level security;
alter table public.app_entitlements   enable row level security;
alter table public.consent_records    enable row level security;
alter table public.data_shares        enable row level security;
alter table public.app_snapshots      enable row level security;
alter table public.data_transfers     enable row level security;
alter table public.transfer_inbox     enable row level security;
alter table public.deletion_requests  enable row level security;
alter table public.app_settings       enable row level security;
alter table public.audit_logs         enable row level security;

-- 既定権限の剥奪
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- 最小限の付与（列単位で token_hash 等の秘匿列を除外）
grant select on public.apps to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.admin_roles to authenticated;
grant select on public.admin_user_scopes to authenticated;
grant select on public.mentor_assignments to authenticated;
grant select (id, email, status, grant_admin_role, expires_at, invited_by, note, accepted_at, accepted_by,
              revoked_at, revoked_by, revoke_reason, reissued_from, created_at, updated_at)
  on public.invitations to authenticated;
grant select on public.invitation_apps to authenticated;
grant select on public.app_entitlements to authenticated;
grant select on public.consent_records to authenticated;
grant select on public.data_shares to authenticated;
grant select on public.app_snapshots to authenticated;
grant select on public.data_transfers to authenticated;
grant select on public.transfer_inbox to authenticated;
grant select on public.deletion_requests to authenticated;
grant select on public.app_settings to authenticated;
grant select on public.audit_logs to authenticated;

-- ---------------------------------------------------------------------
-- apps：有効な利用者なら参照可（機微情報なし）
-- ---------------------------------------------------------------------
create policy apps_select on public.apps for select to authenticated
  using (private.is_active_user());

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (
    (id = auth.uid() and private.is_active_user())
    or private.can_manage_user(id)
    -- メンター⇔担当利用者は互いの氏名だけ確認できる（共有先の選択に必要）
    or (private.is_active_user() and (private.is_assigned_mentor(auth.uid(), id) or private.is_assigned_mentor(id, auth.uid())))
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and private.is_active_user())
  with check (id = auth.uid() and private.is_active_user());

-- ---------------------------------------------------------------------
-- admin_roles / admin_user_scopes / mentor_assignments
-- ---------------------------------------------------------------------
create policy admin_roles_select on public.admin_roles for select to authenticated
  using ((user_id = auth.uid() and private.is_active_user()) or private.is_super_admin() or private.can_manage_user(user_id));

create policy admin_user_scopes_select on public.admin_user_scopes for select to authenticated
  using (private.is_super_admin() or (admin_id = auth.uid() and private.is_admin()));

create policy mentor_assignments_select on public.mentor_assignments for select to authenticated
  using (
    (private.is_active_user() and (mentor_id = auth.uid() or user_id = auth.uid()))
    or private.can_manage_user(user_id)
  );

-- ---------------------------------------------------------------------
-- invitations：Super Admin は全件、Admin は自分が発行したものだけ
-- ---------------------------------------------------------------------
create policy invitations_select on public.invitations for select to authenticated
  using (private.is_super_admin() or (private.is_admin() and invited_by = auth.uid()));

create policy invitation_apps_select on public.invitation_apps for select to authenticated
  using (exists (
    select 1 from public.invitations i
    where i.id = invitation_id
      and (private.is_super_admin() or (private.is_admin() and i.invited_by = auth.uid()))
  ));

-- ---------------------------------------------------------------------
-- app_entitlements / consent_records / deletion_requests
-- ---------------------------------------------------------------------
create policy app_entitlements_select on public.app_entitlements for select to authenticated
  using ((user_id = auth.uid() and private.is_active_user()) or private.can_manage_user(user_id));

create policy consent_records_select on public.consent_records for select to authenticated
  using ((user_id = auth.uid() and private.is_active_user()) or private.can_manage_user(user_id));

create policy deletion_requests_select on public.deletion_requests for select to authenticated
  using ((user_id = auth.uid() and private.is_active_user()) or private.can_manage_user(user_id));

-- ---------------------------------------------------------------------
-- data_shares：本人（共有元）と、有効な担当関係にある共有先のみ
-- ---------------------------------------------------------------------
create policy data_shares_select on public.data_shares for select to authenticated
  using (
    (owner_id = auth.uid() and private.is_active_user())
    or (
      grantee_id = auth.uid() and private.is_active_user()
      and status = 'active' and (expires_at is null or expires_at > now())
      and private.is_assigned_mentor(auth.uid(), owner_id)
    )
  );

-- ---------------------------------------------------------------------
-- app_snapshots：本人（アプリ権限あり）＋ 明示共有された共有先のみ。管理者は不可
-- ---------------------------------------------------------------------
create policy app_snapshots_select on public.app_snapshots for select to authenticated
  using (
    (user_id = auth.uid() and private.has_app_access(app_code))
    or (
      private.is_active_user() and exists (
        select 1 from public.data_shares s
        where s.resource_type = 'app_snapshot' and s.resource_id = app_snapshots.id
          and s.grantee_id = auth.uid() and s.owner_id = app_snapshots.user_id
          and s.status = 'active' and (s.expires_at is null or s.expires_at > now())
          and private.is_assigned_mentor(auth.uid(), app_snapshots.user_id)
      )
    )
  );

-- ---------------------------------------------------------------------
-- data_transfers：本人＋担当管理者（状態のみ。ペイロードは保持しない）
-- transfer_inbox：本人（転送先アプリ権限あり）のみ
-- ---------------------------------------------------------------------
create policy data_transfers_select on public.data_transfers for select to authenticated
  using ((user_id = auth.uid() and private.is_active_user()) or private.can_manage_user(user_id));

create policy transfer_inbox_select on public.transfer_inbox for select to authenticated
  using (user_id = auth.uid() and private.has_app_access(target_app));

-- ---------------------------------------------------------------------
-- app_settings：管理者のみ参照
-- audit_logs  ：Super Admin は全件、Admin は担当利用者に関する記録と自分の操作
-- ---------------------------------------------------------------------
create policy app_settings_select on public.app_settings for select to authenticated
  using (private.is_admin());

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    private.is_super_admin()
    or (private.is_admin() and (actor_id = auth.uid() or (target_user_id is not null and private.can_manage_user(target_user_id))))
  );
