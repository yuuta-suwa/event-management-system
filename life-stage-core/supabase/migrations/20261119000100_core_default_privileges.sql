-- =====================================================================
-- LIFE STAGE COMMON CORE  |  0008 既定権限の強化（LEI APP HUB の設計パターンを取り込み）
--
-- Supabase は public スキーマの新規テーブル・関数を anon/authenticated に自動 GRANT する
-- 旧既定から、明示 GRANT 必須へ移行中。新旧どちらのプロジェクトでも同じ結果になるよう、
-- 以後に作成するテーブル・関数・シーケンスを自動公開しない。
-- （既存オブジェクトは 0003 / 各 RPC で個別に revoke 済み）
-- 参照: https://supabase.com/docs/guides/api/securing-your-api
-- =====================================================================
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete, truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated;

-- 注意：関数の「PUBLIC への EXECUTE」は PostgreSQL の全体既定であり、
-- スキーマ単位（IN SCHEMA）の既定権限では取り消せない（スキーマ単位は追加のみ可能）。
-- このため postgres ロールが今後作る関数について、全体既定から PUBLIC の EXECUTE を外す。
-- （LEI APP HUB の IN SCHEMA 指定のみの記述ではこの点が効かないことをテストで確認した）
-- 影響：postgres が新規作成する関数は、明示的に GRANT しない限り誰も実行できない。
--       本基盤の関数はすべて個別に GRANT しているため既存の動作は変わらない。
alter default privileges for role postgres
  revoke execute on functions from public;

-- 念のため既存オブジェクトにも再適用（冪等）
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
grant update (display_name) on public.profiles to authenticated;
revoke all on all sequences in schema public from anon, authenticated;
