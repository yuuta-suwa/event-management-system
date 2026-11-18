-- =====================================================================
-- LIFE STAGE COMMON CORE  |  0007 初期データ（アプリ登録・設定）
-- LIFE_ACCOUNTING は将来追加候補として無効状態で登録（発注者承認後に有効化）
-- =====================================================================
insert into public.apps (code, name_en, name_ja, description, is_active, sort_order) values
  ('APP01', 'THE FINAL DISCOVERY', '人生設計', 'LIFE STAGE APP01｜願望・人生の目的・目標と期限の明確化（WHY）', true, 10),
  ('APP02', 'SELF-REALIZATION ENGINE', '成長戦略', 'LIFE STAGE APP02｜6大能力×10年の成長計画（HOW）', true, 20),
  ('APP03', 'MAKE IT REAL', '実行・実績・認定', 'LIFE STAGE APP03｜実績・能力認定・称号（7能力×10年）', true, 30),
  ('LIFE_ACCOUNTING', 'LIFE ACCOUNTING', '人生経理', '将来追加候補（未承認のため無効）', false, 40)
on conflict (code) do nothing;

insert into public.app_settings (key, value) values
  ('invitation_ttl_hours', '72'::jsonb),
  ('require_admin_mfa', 'true'::jsonb)
on conflict (key) do nothing;
