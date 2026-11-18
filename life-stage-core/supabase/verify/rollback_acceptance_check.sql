-- =====================================================================
-- 実 Supabase 上での受入シナリオ検証（必ず全件ロールバック）
--
-- 使い方：Supabase SQL Editor（または MCP execute_sql）で実行する。
-- 最後に意図的に例外を送出するため、作成したテストユーザー・招待・監査ログは一切残らない。
-- 期待結果はエラーメッセージ「ROLLBACK_RESULT ...」に一覧で表示される（docs/TEST_PLAN.md 参照）。
-- 2026-11-18 開発プロジェクト（東京）で実行し、全項目が期待どおりであることを確認済み。
-- 注意：本番プロジェクトで実行する場合も残存データはないが、auth.users への一時挿入を伴うため
--       実施前に承認を得ること。
-- =====================================================================
do $$
declare
  r        text[] := '{}';
  root     uuid := gen_random_uuid();
  ua       uuid := gen_random_uuid();
  ub       uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  inv      jsonb;
  res      jsonb;
  n        int;
begin
  insert into auth.users(id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (root, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'root-at@example.com', now(), '{}', '{}', now(), now()),
         (ua,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ua-at@example.com',   now(), '{}', '{"role":"super_admin"}', now(), now()),
         (ub,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ub-at@example.com',   now(), '{}', '{}', now(), now()),
         (stranger, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger-at@example.com', now(), '{}', '{}', now(), now());
  insert into auth.identities(id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  select gen_random_uuid(), u, 'google', u::text, jsonb_build_object('sub', u::text), now(), now()
    from unnest(array[root, ua, ub, stranger]) u;

  inv := private.bootstrap_super_admin('root-at@example.com');
  perform set_config('request.jwt.claims', json_build_object('sub', root, 'role','authenticated','aal','aal2')::text, true);
  set local role authenticated;
  res := public.accept_invitation(inv->>'token');
  r := r || ('bootstrap accept: ' || (res->>'code'));

  inv := public.admin_create_invitation('ua-at@example.com', array['APP01'], null, null, null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated','aal','aal1')::text, true);
  set local role authenticated;
  res := public.accept_invitation(inv->>'token');
  r := r || ('AT02 accept: ' || (res->>'code'));
  res := public.accept_invitation(inv->>'token');
  r := r || ('AT02 reuse: ' || (res->>'code'));

  r := r || ('AT05 APP01=' || public.check_app_access('APP01') || ' APP02=' || public.check_app_access('APP02'));
  r := r || ('AT11 roles(meta=super_admin)=' || (public.my_access()->'roles')::text);
  begin
    perform public.admin_list_users(null, null, 10, 0);
    r := r || 'AT11 user admin rpc: ALLOWED(NG)';
  exception when others then r := r || ('AT11 user admin rpc: ' || sqlerrm); end;
  begin
    insert into public.admin_roles(user_id, role) values (ua, 'super_admin');
    r := r || 'AT11 direct insert: ALLOWED(NG)';
  exception when others then r := r || ('AT11 direct insert: ' || sqlstate); end;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role','authenticated','aal','aal1')::text, true);
  set local role authenticated;
  r := r || ('AT01 stranger status=' || (public.my_access()->>'status'));
  select count(*) into n from public.profiles;
  r := r || ('AT01 stranger visible profiles=' || n);
  res := public.accept_invitation(inv->>'token');
  r := r || ('AT01 stranger uses others token: ' || (res->>'code'));

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', root, 'role','authenticated','aal','aal2')::text, true);
  set local role authenticated;
  inv := public.admin_create_invitation('ub-at@example.com', array['APP01'], null, null, null);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated','aal','aal1')::text, true);
  set local role authenticated;
  perform public.accept_invitation(inv->>'token');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated','aal','aal1')::text, true);
  set local role authenticated;
  perform public.confirm_snapshot('APP01', 'life_blueprint', '1.0', '{"secret":"ua"}'::jsonb);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated','aal','aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.app_snapshots where user_id = ua;
  r := r || ('AT07 ub sees ua snapshots=' || n);

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', root, 'role','authenticated','aal','aal2')::text, true);
  set local role authenticated;
  select count(*) into n from public.app_snapshots;
  r := r || ('AT07 super admin sees snapshots=' || n);

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', root, 'role','authenticated','aal','aal1')::text, true);
  set local role authenticated;
  begin
    perform public.admin_set_entitlement(ua, 'APP02', true, null);
    r := r || 'MFA aal1: ALLOWED(NG)';
  exception when others then r := r || ('MFA aal1: ' || sqlerrm); end;

  reset role;
  insert into auth.sessions(id, user_id, created_at, updated_at) values (gen_random_uuid(), ua, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', root, 'role','authenticated','aal','aal2')::text, true);
  set local role authenticated;
  perform public.admin_set_user_status(ua, 'suspend', 'AT08');
  reset role;
  select count(*) into n from auth.sessions where user_id = ua;
  r := r || ('AT08 sessions after suspend=' || n);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated','aal','aal1')::text, true);
  set local role authenticated;
  r := r || ('AT08 status=' || (public.my_access()->>'status') || ' APP01=' || public.check_app_access('APP01'));
  select count(*) into n from public.app_snapshots;
  r := r || ('AT08 visible snapshots=' || n);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', root, 'role','authenticated','aal','aal2')::text, true);
  set local role authenticated;
  perform public.admin_set_user_status(ua, 'resume', 'AT09');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated','aal','aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.app_snapshots;
  r := r || ('AT09 resumed APP01=' || public.check_app_access('APP01') || ' snapshots kept=' || n);

  reset role;
  select count(*) into n from public.audit_logs;
  r := r || ('AT17 audit rows=' || n);
  begin
    update public.audit_logs set action = 'x';
    r := r || 'AT17 tamper: ALLOWED(NG)';
  exception when others then r := r || ('AT17 tamper: ' || sqlerrm); end;

  raise exception 'ROLLBACK_RESULT %', array_to_string(r, ' | ');
end $$;

-- 2026-11-18 実行結果（開発プロジェクト・東京）:
-- bootstrap accept: ACCEPTED | AT02 accept: ACCEPTED | AT02 reuse: INVITATION_USED | AT05 APP01=true APP02=false |
-- AT11 roles(meta=super_admin)=[] | AT11 user admin rpc: FORBIDDEN | AT11 direct insert: 42501 |
-- AT01 stranger status=not_invited | AT01 stranger visible profiles=0 | AT01 stranger uses others token: INVITATION_USED |
-- AT07 ub sees ua snapshots=0 | AT07 super admin sees snapshots=0 | MFA aal1: MFA_REQUIRED |
-- AT08 sessions after suspend=0 | AT08 status=suspended APP01=false | AT08 visible snapshots=0 |
-- AT09 resumed APP01=true snapshots kept=1 | AT17 audit rows=11 | AT17 tamper: AUDIT_LOG_IMMUTABLE
-- 実行後の残存件数：auth.users=0, profiles=0, invitations=0, audit_logs=0
