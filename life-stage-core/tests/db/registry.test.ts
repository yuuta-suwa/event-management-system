/**
 * アプリ登録マスター方式・既定権限の強化
 */
import { describe, it, expect, beforeAll } from "vitest";
import { expectFail, invitedUser, rpc, selectAs, sql, superAdmin, validBlueprint } from "./helpers";

type U = { id: string; email: string };
type AppAccess = { code: string; lifecycle: string; granted: boolean; app_roles: { role: string; scope: string }[] };
let root: U;
beforeAll(async () => {
  root = await superAdmin();
});

describe("Data API 公開範囲（旧既定の自動 GRANT を再現した DB で検証）", () => {
  it("anon は public のどのテーブル・シーケンスにも権限を持たない", async () => {
    const rows = await sql<{ t: string; p: string }>(`
      select c.relname t, p.p from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) p(p)
      where n.nspname = 'public' and c.relkind in ('r','v','m','S') and has_table_privilege('anon', c.oid, p.p)`);
    expect(rows).toEqual([]);
  });

  it("authenticated はテーブルに書き込めない（profiles.display_name の更新のみ例外）", async () => {
    const rows = await sql<{ t: string; p: string }>(`
      select c.relname t, p.p from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) p(p)
      where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('authenticated', c.oid, p.p)`);
    expect(rows).toEqual([]);
    const [col] = await sql<{ ok: boolean }>("select has_column_privilege('authenticated','public.profiles','display_name','UPDATE') ok");
    expect(col.ok).toBe(true);
    const [st] = await sql<{ ok: boolean }>("select has_column_privilege('authenticated','public.profiles','status','UPDATE') ok");
    expect(st.ok).toBe(false);
  });

  it("全テーブルで RLS が有効", async () => {
    const rows = await sql("select tablename from pg_tables where schemaname = 'public' and not rowsecurity");
    expect(rows).toEqual([]);
  });

  it("anon はどの RPC も実行できない。private の関数は API から呼べない", async () => {
    const rows = await sql<{ f: string }>(`
      select p.proname f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'EXECUTE')`);
    expect(rows).toEqual([]);
    const boot = await sql<{ ok: boolean }>(`select has_function_privilege('authenticated', 'private.bootstrap_super_admin(text,integer)', 'EXECUTE') ok`);
    expect(boot[0].ok).toBe(false);
  });

  it("今後作成するテーブル・関数も自動公開されない（既定権限の取り消し）", async () => {
    await sql("create table public.zz_probe (id int)");
    await sql("create function public.zz_probe_fn() returns int language sql as 'select 1'");
    try {
      const [t] = await sql<{ a: boolean; u: boolean }>(
        "select has_table_privilege('anon','public.zz_probe','SELECT') a, has_table_privilege('authenticated','public.zz_probe','INSERT') u");
      expect(t).toEqual({ a: false, u: false });
      const [f] = await sql<{ a: boolean; u: boolean }>(
        "select has_function_privilege('anon','public.zz_probe_fn()','EXECUTE') a, has_function_privilege('authenticated','public.zz_probe_fn()','EXECUTE') u");
      expect(f).toEqual({ a: false, u: false });
    } finally {
      await sql("drop function public.zz_probe_fn()");
      await sql("drop table public.zz_probe");
    }
  });
});

describe("アプリ登録マスター", () => {
  it("初期登録：APP01〜03 は active、LIFE_ACCOUNTING は planned で利用者に表示されない", async () => {
    const apps = await sql<{ code: string; lifecycle: string; is_active: boolean }>("select code, lifecycle, is_active from public.apps order by sort_order");
    expect(apps).toEqual([
      { code: "APP01", lifecycle: "active", is_active: true },
      { code: "APP02", lifecycle: "active", is_active: true },
      { code: "APP03", lifecycle: "active", is_active: true },
      { code: "LIFE_ACCOUNTING", lifecycle: "planned", is_active: false },
    ]);
    const u = await invitedUser(root.id, ["APP01"]);
    const access = await rpc<{ apps: AppAccess[] }>(u.id, "my_access");
    expect(access.apps.map((a) => a.code)).toEqual(["APP01", "APP02", "APP03"]);
  });

  it("新アプリは migration なしの登録（INSERT）だけで権限付与・判定が機能する（コード変更不要）", async () => {
    await sql(`insert into public.apps(code, name_en, name_ja, lifecycle, sort_order) values ('APP_TEST', 'TEST APP', 'テスト', 'planned', 90)`);
    const u = await invitedUser(root.id, ["APP01"]);
    // planned は付与不可
    await expectFail(rpc(root.id, "admin_set_entitlement", [u.id, "APP_TEST", true, null]), "INVALID_APP");
    // 公開段階の変更は Super Admin のみ、理由必須、監査記録
    const admin = await invitedUser(root.id, [], { role: "admin" });
    await expectFail(rpc(admin.id, "admin_set_app_lifecycle", ["APP_TEST", "trial", "試験"]), "FORBIDDEN");
    await expectFail(rpc(root.id, "admin_set_app_lifecycle", ["APP_TEST", "trial", ""]), "REASON_REQUIRED");
    await rpc(root.id, "admin_set_app_lifecycle", ["APP_TEST", "trial", "試験運用開始"]);
    await rpc(root.id, "admin_set_entitlement", [u.id, "APP_TEST", true, null]);
    expect(await rpc(u.id, "check_app_access", ["APP_TEST"])).toBe(true);
    // 退役させると既存の権限があっても利用不可
    await rpc(root.id, "admin_set_app_lifecycle", ["APP_TEST", "retired", "終了"]);
    expect(await rpc(u.id, "check_app_access", ["APP_TEST"])).toBe(false);
    const logs = await sql("select * from public.audit_logs where action = 'app.lifecycle' and target_id = 'APP_TEST'");
    expect(logs).toHaveLength(2);
  });

  it("URL は https のみ登録可能", async () => {
    await expectFail(sql("update public.apps set base_url = 'http://insecure.example.com' where code = 'APP01'"), /check constraint/);
    await expectFail(sql("update public.apps set allowed_redirect_origins = array['javascript:alert(1)'] where code = 'APP01'"), /check constraint/);
    await sql("update public.apps set base_url = 'https://app01.example.com', allowed_redirect_origins = array['https://app01.example.com'] where code = 'APP01'");
    await sql("update public.apps set base_url = null, allowed_redirect_origins = '{}' where code = 'APP01'");
  });

  it("利用者はアプリ登録マスターを変更できない", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    const { as } = await import("./helpers");
    await expectFail(as(u.id, (c) => c.query("update public.apps set lifecycle = 'active' where code = 'LIFE_ACCOUNTING'")), /permission denied/);
    await expectFail(as(u.id, (c) => c.query("insert into public.transfer_routes(source_app, snapshot_type, schema_version, target_app) values ('APP01','life_blueprint','1.0','APP03')")), /permission denied/);
  });
});

describe("アプリ固有ロール", () => {
  it("APP03 審査者：Super Admin のみ付与、アプリ権限が前提、スコープ必須、判定関数で確認できる", async () => {
    const admin = await invitedUser(root.id, [], { role: "admin" });
    const u = await invitedUser(root.id, ["APP01"]);
    await rpc(root.id, "admin_set_scope", [admin.id, u.id, true]);

    await expectFail(rpc(root.id, "admin_set_app_role", [u.id, "APP03", "reviewer", true, "biz-1", null]), "APP_ACCESS_DENIED");
    await rpc(root.id, "admin_set_entitlement", [u.id, "APP03", true, null]);
    await expectFail(rpc(root.id, "admin_set_app_role", [u.id, "APP03", "reviewer", true, "", null]), "SCOPE_REQUIRED");
    await expectFail(rpc(admin.id, "admin_set_app_role", [u.id, "APP03", "reviewer", true, "biz-1", null]), "FORBIDDEN");
    await expectFail(rpc(root.id, "admin_set_app_role", [u.id, "APP03", "no_such_role", true, "x", null]), "INVALID_ROLE");
    await rpc(root.id, "admin_set_app_role", [u.id, "APP03", "reviewer", true, "biz-1", "審査担当"]);

    const has = async (scope: string) =>
      (await selectAs<{ ok: boolean }>(u.id, "select private.has_app_role('APP03','reviewer',$1) ok", [scope]))[0].ok;
    expect(await has("biz-1")).toBe(true);
    expect(await has("biz-2")).toBe(false);
    const access = await rpc<{ apps: AppAccess[] }>(u.id, "my_access");
    expect(access.apps.find((a) => a.code === "APP03")?.app_roles).toEqual([{ role: "reviewer", scope: "biz-1" }]);

    // アプリ権限を取り消すとロールも無効
    await rpc(root.id, "admin_set_entitlement", [u.id, "APP03", false, null]);
    expect(await has("biz-1")).toBe(false);
    // 停止中も無効
    await rpc(root.id, "admin_set_entitlement", [u.id, "APP03", true, null]);
    await rpc(root.id, "admin_set_user_status", [u.id, "suspend", "test"]);
    expect(await has("biz-1")).toBe(false);
    await rpc(root.id, "admin_set_user_status", [u.id, "resume", "test"]);
    expect(await has("biz-1")).toBe(true);

    await rpc(root.id, "admin_set_app_role", [u.id, "APP03", "reviewer", false, "biz-1", "交代"]);
    expect(await has("biz-1")).toBe(false);
    const actions = (await sql<{ action: string }>("select action from public.audit_logs where target_user_id = $1 and action like 'app_role.%' order by id", [u.id])).map((r) => r.action);
    expect(actions).toEqual(["app_role.grant", "app_role.revoke"]);
  });

  it("本人は自分のアプリ固有ロールを付与できない", async () => {
    const u = await invitedUser(root.id, ["APP02"]);
    await expectFail(rpc(u.id, "admin_set_app_role", [u.id, "APP02", "legacy_eligible", true, "", null]), "FORBIDDEN");
    await expectFail(rpc(root.id, "admin_set_app_role", [root.id, "APP02", "legacy_eligible", true, "", null]), "CANNOT_TARGET_SELF");
  });
});

describe("連携経路のマスター化", () => {
  it("経路を無効化すると転送できず（INVALID_ROUTE）、再有効化すると転送できる", async () => {
    const u = await invitedUser(root.id, ["APP01", "APP02"]);
    const s = await rpc<{ snapshot_id: string }>(u.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", validBlueprint()]);
    await sql("update public.transfer_routes set is_active = false where source_app = 'APP01' and target_app = 'APP02'");
    try {
      await expectFail(rpc(u.id, "request_transfer", [s.snapshot_id, "APP02", "1.0", "2026-11"]), "INVALID_ROUTE");
    } finally {
      await sql("update public.transfer_routes set is_active = true where source_app = 'APP01' and target_app = 'APP02'");
    }
    expect((await rpc<{ status: string }>(u.id, "request_transfer", [s.snapshot_id, "APP02", "1.0", "2026-11"])).status).toBe("succeeded");
  });

  it("未登録のスナップショット種別・版は確定できない", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    await expectFail(rpc(u.id, "confirm_snapshot", ["APP01", "life_blueprint", "9.9", validBlueprint()]), "INVALID_SNAPSHOT_TYPE");
    await expectFail(rpc(u.id, "confirm_snapshot", ["APP01", "growth_plan", "1.0", {}]), "INVALID_SNAPSHOT_TYPE");
  });
});
