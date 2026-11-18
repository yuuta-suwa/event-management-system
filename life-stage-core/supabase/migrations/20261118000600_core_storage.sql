-- =====================================================================
-- LIFE STAGE COMMON CORE  |  0006 Storage（非公開バケット）
-- パス規約：<user_id>/<app_code>/<file>
-- 本人（active かつ該当アプリ権限あり）のみ読み書き可。公開URLは発行しない。
-- 共有は署名付きURL（短時間）をサーバー側で発行する方式とする（各APP実装時）。
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-files', 'user-files', false, 10485760, array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do update set public = false;

create policy user_files_select on storage.objects for select to authenticated
  using (bucket_id = 'user-files'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and private.has_app_access((storage.foldername(name))[2]));
create policy user_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'user-files'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and private.has_app_access((storage.foldername(name))[2]));
create policy user_files_update on storage.objects for update to authenticated
  using (bucket_id = 'user-files'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and private.has_app_access((storage.foldername(name))[2]))
  with check (bucket_id = 'user-files'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and private.has_app_access((storage.foldername(name))[2]));
create policy user_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'user-files'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and private.has_app_access((storage.foldername(name))[2]));
