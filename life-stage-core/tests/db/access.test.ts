/**
 * アプリ別権限・他人データ・停止/再開・担当範囲・権限昇格・MFA・監査（AT05〜AT11, AT17）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { as, createAuthUser, expectFail, invitedUser, rpc, selectAs, sql, superAdmin, uniqueEmail } from "./helpers";

type Access = { status: string; apps: { code: string; granted: boolean }[]; roles: string[] };
type U = { id: string; email: string };

let root: U;
beforeAll(async () => {
  root = await superAdmin();
});

describe("AT05/AT06 アプリ別アクセス権限", () => {
  it("APP01の権限はAPP02/APP03を含意しない。付与・取消が即時反映される", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    expect(await rpc(u.id, "check_app_access", ["APP01"])).toBe(true);
    expect(await rpc(u.id, "check_app_access", ["APP02"])).toBe(false);
    expect(await rpc(u.id, "check_app_access", ["APP03"])).toBe(false);

    await rpc(root.id, "admin_set_entitlement", [u.id, "APP02", true, "trial"]);
    expect(await rpc(u.id, "check_app_access", ["APP02"])).toBe(true);
    await rpc(root.id, "admin_set_entitlement", [u.id, "APP01", false, "終了"]);
    expect(await rpc(u.id, "check_app_access", ["APP01"])).toBe(false);
    const ents = await selectAs<{ app_code: string; status: string }>(u.id, "select app_code, status from public.app_entitlements order by app_code");
    expect(ents).toEqual([{ app_code: "APP01", status: "revoked" }, { app_code: "APP02", status: "active" }]);
  });

  it("権限のないアプリの確定データは作成も閲覧もできない（直接アクセス拒否）", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    await expectFail(rpc(u.id, "confirm_snapshot", ["APP02", "growth_plan", "1.0", {}]), "APP_ACCESS_DENIED");
    // 利用者はテーブルへ直接書き込めない
    await expectFail(as(u.id, (c) => c.query(
      "insert into public.app_snapshots(user_id, app_code, snapshot_type, schema_version, payload, version) values ($1,'APP02','growth_plan','1.0','{}',1)", [u.id],
    )), /permission denied/);
    await expectFail(as(u.id, (c) => c.query(
      "insert into public.app_entitlements(user_id, app_code) values ($1, 'APP03')", [u.id],
    )), /permission denied/);
  });

  it("無効化されたアプリ（LIFE_ACCOUNTING）は付与不可", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    await expectFail(rpc(root.id, "admin_set_entitlement", [u.id, "LIFE_ACCOUNTING", true, null]), "INVALID_APP");
  });
});

describe("AT07 他人のデータ取得拒否", () => {
  it("他の利用者のプロフィール・権限・同意・スナップショットは見えない", async () => {
    const a = await invitedUser(root.id, ["APP01"]);
    const b = await invitedUser(root.id, ["APP01"]);
    await rpc(a.id, "record_consent", ["privacy", "2026-11", null]);
    await rpc(a.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", { secret: "a-only" }]);

    for (const t of ["profiles", "app_entitlements", "consent_records", "app_snapshots", "admin_roles", "data_transfers"]) {
      const rows = await selectAs<{ user_id?: string; id?: string }>(b.id, `select * from public.${t}`);
      expect(JSON.stringify(rows)).not.toContain(a.id);
    }
    // user_id を指定した問い合わせも0件
    expect(await selectAs(b.id, "select * from public.app_snapshots where user_id = $1", [a.id])).toHaveLength(0);
    // 他人の表示名は更新できない（0件更新）
    const n = await as(b.id, async (c) => (await c.query("update public.profiles set display_name = 'x' where id = $1", [a.id])).rowCount);
    expect(n).toBe(0);
  });

  it("管理者であっても各アプリの個人データ（スナップショット・受信箱）は閲覧できない", async () => {
    const a = await invitedUser(root.id, ["APP01"]);
    await rpc(a.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", { secret: "private-life" }]);
    expect(await selectAs(root.id, "select * from public.app_snapshots where user_id = $1", [a.id])).toHaveLength(0);
    expect(await selectAs(root.id, "select * from public.transfer_inbox where user_id = $1", [a.id])).toHaveLength(0);
    // 運用情報（プロフィール・権限）は見える
    expect(await selectAs(root.id, "select id from public.profiles where id = $1", [a.id])).toHaveLength(1);
  });

  it("Storage：自分のフォルダかつ権限のあるアプリだけ読み書き可能", async () => {
    const a = await invitedUser(root.id, ["APP01"]);
    const b = await invitedUser(root.id, ["APP01"]);
    await as(a.id, (c) => c.query("insert into storage.objects(bucket_id, name, owner) values ('user-files', $1, $2)", [`${a.id}/APP01/vision.png`, a.id]));
    await expectFail(as(a.id, (c) => c.query("insert into storage.objects(bucket_id, name) values ('user-files', $1)", [`${b.id}/APP01/x.png`])), /row-level security/);
    await expectFail(as(a.id, (c) => c.query("insert into storage.objects(bucket_id, name) values ('user-files', $1)", [`${a.id}/APP02/x.png`])), /row-level security/);
    expect(await selectAs(b.id, "select * from storage.objects where name like $1", [`${a.id}/%`])).toHaveLength(0);
    expect(await selectAs(a.id, "select * from storage.objects")).toHaveLength(1);
    const [bucket] = await sql<{ public: boolean }>("select public from storage.buckets where id = 'user-files'");
    expect(bucket.public).toBe(false);
  });
});

describe("AT08/AT09 停止後の遮断と再開", () => {
  it("停止すると既存JWTでもDB・RPCが拒否され、セッションが失効。再開でデータを保持したまま復帰", async () => {
    const u = await invitedUser(root.id, ["APP01", "APP02"]);
    await rpc(u.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", { keep: "me" }]);
    expect(await sql("select * from auth.sessions where user_id = $1", [u.id])).toHaveLength(1);

    await rpc(root.id, "admin_set_user_status", [u.id, "suspend", "規約確認のため"]);
    // 同じ（失効前の）JWTクレームのまま
    expect((await rpc<Access>(u.id, "my_access")).status).toBe("suspended");
    expect((await rpc<Access>(u.id, "my_access")).apps.every((a) => !a.granted)).toBe(true);
    expect(await rpc(u.id, "check_app_access", ["APP01"])).toBe(false);
    for (const t of ["profiles", "app_entitlements", "app_snapshots", "apps", "consent_records"]) {
      expect(await selectAs(u.id, `select * from public.${t}`)).toHaveLength(0);
    }
    await expectFail(rpc(u.id, "my_export"), "ACCOUNT_NOT_ACTIVE");
    await expectFail(rpc(u.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", {}]), "ACCOUNT_NOT_ACTIVE");
    await expectFail(as(u.id, (c) => c.query("insert into storage.objects(bucket_id, name) values ('user-files', $1)", [`${u.id}/APP01/a.png`])), /row-level security/);
    expect(await sql("select * from auth.sessions where user_id = $1", [u.id])).toHaveLength(0);
    // 停止中に新しい招待で回避できない
    await expectFail(rpc(root.id, "admin_create_invitation", [u.email, ["APP03"], null, null, null]), "ALREADY_MEMBER");

    await rpc(root.id, "admin_set_user_status", [u.id, "resume", "確認完了"]);
    expect((await rpc<Access>(u.id, "my_access")).status).toBe("active");
    expect(await rpc(u.id, "check_app_access", ["APP02"])).toBe(true);
    const snaps = await selectAs<{ payload: { keep: string } }>(u.id, "select payload from public.app_snapshots");
    expect(snaps[0].payload.keep).toBe("me");
  });

  it("不正な状態遷移・自分自身の停止・最後のSuper Adminの停止は拒否", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    await expectFail(rpc(root.id, "admin_set_user_status", [u.id, "resume", null]), "INVALID_STATUS_TRANSITION");
    await expectFail(rpc(root.id, "admin_set_user_status", [root.id, "suspend", null]), "CANNOT_TARGET_SELF");
    await expectFail(rpc(root.id, "admin_set_user_status", [u.id, "delete-all", null]), "INVALID_ACTION");
  });
});

describe("AT10 Admin の担当範囲", () => {
  it("Admin は担当利用者のみ管理でき、範囲外・他の管理者は操作できない", async () => {
    const admin = await invitedUser(root.id, [], { role: "admin" });
    const inScope = await invitedUser(root.id, ["APP01"]);
    const outScope = await invitedUser(root.id, ["APP01"]);
    await rpc(root.id, "admin_set_scope", [admin.id, inScope.id, true]);

    await rpc(admin.id, "admin_set_entitlement", [inScope.id, "APP02", true, null]);
    await expectFail(rpc(admin.id, "admin_set_entitlement", [outScope.id, "APP02", true, null]), "FORBIDDEN");
    await expectFail(rpc(admin.id, "admin_set_user_status", [outScope.id, "suspend", null]), "FORBIDDEN");
    await expectFail(rpc(admin.id, "admin_set_user_status", [root.id, "suspend", null]), "FORBIDDEN");

    const list = await rpc<{ users: { id: string }[] }>(admin.id, "admin_list_users", [null, null, 50, 0]);
    expect(list.users.map((x) => x.id)).toEqual([inScope.id]);
    expect(await selectAs(admin.id, "select id from public.profiles where id = $1", [outScope.id])).toHaveLength(0);

    // Admin が招待した利用者は自動的にその Admin の担当範囲
    const mine = await invitedUser(admin.id, ["APP01"]);
    await rpc(admin.id, "admin_set_user_status", [mine.id, "suspend", "test"]);
    // Admin は他の Admin が発行した招待を操作できない
    const rootInv = await rpc<{ invitation_id: string }>(root.id, "admin_create_invitation", [uniqueEmail(), ["APP01"], null, null, null]);
    await expectFail(rpc(admin.id, "admin_revoke_invitation", [rootInv.invitation_id, null]), "NOT_FOUND");
  });
});

describe("AT11 権限昇格の防止", () => {
  it("一般利用者は管理RPCを実行できず、ロール・状態を直接書き換えられない", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    await expectFail(rpc(u.id, "admin_set_role", [u.id, "super_admin", true, null]), "FORBIDDEN");
    await expectFail(rpc(u.id, "admin_create_invitation", [uniqueEmail(), ["APP01"], null, null, null]), "FORBIDDEN");
    await expectFail(rpc(u.id, "admin_set_entitlement", [u.id, "APP02", true, null]), "FORBIDDEN");
    await expectFail(rpc(u.id, "admin_list_users", [null, null, 10, 0]), "FORBIDDEN");
    await expectFail(as(u.id, (c) => c.query("insert into public.admin_roles(user_id, role) values ($1, 'super_admin')", [u.id])), /permission denied/);
    await expectFail(as(u.id, (c) => c.query("update public.profiles set status = 'active' where id = $1", [u.id])), /permission denied/);
    await expectFail(as(u.id, (c) => c.query("select private.bootstrap_super_admin('x@example.com')")), /permission denied/);
    // auth.users のメタデータを書き換えても権限には影響しない
    await sql(`update auth.users set raw_user_meta_data = '{"role":"super_admin"}', raw_app_meta_data = '{"role":"super_admin"}' where id = $1`, [u.id]);
    expect((await rpc<Access>(u.id, "my_access")).roles).toEqual([]);
    await expectFail(rpc(u.id, "admin_dashboard_stats"), "FORBIDDEN");
  });

  it("Admin はロール付与・管理ロール付き招待・設定変更ができない", async () => {
    const admin = await invitedUser(root.id, [], { role: "admin" });
    const u = await invitedUser(root.id, ["APP01"]);
    await expectFail(rpc(admin.id, "admin_set_role", [u.id, "admin", true, null]), "FORBIDDEN");
    await expectFail(rpc(admin.id, "admin_create_invitation", [uniqueEmail(), ["APP01"], "admin", null, null]), "FORBIDDEN");
    await expectFail(rpc(admin.id, "admin_update_setting", ["invitation_ttl_hours", 24]), "FORBIDDEN");
    await expectFail(rpc(admin.id, "admin_set_scope", [admin.id, u.id, true]), "FORBIDDEN");
  });

  it("Super Admin は自分のロールを変更できず、MFA未検証(aal1)では管理操作できない", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    await expectFail(rpc(root.id, "admin_set_role", [root.id, "super_admin", false, null]), "CANNOT_TARGET_SELF");
    await expectFail(rpc(root.id, "admin_set_entitlement", [u.id, "APP02", true, null], "aal1"), "MFA_REQUIRED");
    await expectFail(rpc(root.id, "admin_list_users", [null, null, 10, 0], "aal1"), "MFA_REQUIRED");
    await expectFail(rpc(root.id, "admin_update_setting", ["require_admin_mfa", false]), "SETTING_LOCKED");
  });

  it("ロールを剥奪された管理者は直ちに管理操作できない", async () => {
    const admin = await invitedUser(root.id, [], { role: "admin" });
    const u = await invitedUser(admin.id, ["APP01"]);
    await rpc(root.id, "admin_set_role", [admin.id, "admin", false, "異動"]);
    await expectFail(rpc(admin.id, "admin_set_entitlement", [u.id, "APP02", true, null]), "FORBIDDEN");
    expect(await sql("select * from public.admin_user_scopes where admin_id = $1 and revoked_at is null", [admin.id])).toHaveLength(0);
  });

  it("停止された管理者は管理操作できない", async () => {
    const admin = await invitedUser(root.id, [], { role: "admin" });
    await rpc(root.id, "admin_set_user_status", [admin.id, "suspend", "test"]);
    await expectFail(rpc(admin.id, "admin_list_users", [null, null, 10, 0]), "FORBIDDEN");
  });
});

describe("AT17 監査ログ", () => {
  it("管理者の重要操作が実行者・対象・変更前後つきで記録される", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    await rpc(root.id, "admin_set_entitlement", [u.id, "APP03", true, "付与理由"]);
    await rpc(root.id, "admin_set_user_status", [u.id, "suspend", "停止理由"]);
    await rpc(root.id, "admin_set_user_status", [u.id, "resume", "再開理由"]);
    const logs = await sql<{ action: string; actor_id: string; actor_aal: string; before_state: unknown; after_state: unknown; reason: string }>(
      "select action, actor_id, actor_aal, before_state, after_state, reason from public.audit_logs where target_user_id = $1 order by id", [u.id],
    );
    expect(logs.map((l) => l.action)).toEqual(["invitation.accept", "entitlement.grant", "user.suspend", "user.resume"]);
    const suspend = logs[2];
    expect(suspend).toMatchObject({ actor_id: root.id, actor_aal: "aal2", reason: "停止理由",
      before_state: { status: "active" }, after_state: { status: "suspended" } });
  });

  it("監査ログは改ざん・削除できない（運用者権限でも）", async () => {
    await expectFail(sql("update public.audit_logs set action = 'tampered'"), "AUDIT_LOG_IMMUTABLE");
    await expectFail(sql("delete from public.audit_logs"), "AUDIT_LOG_IMMUTABLE");
    await expectFail(sql("truncate public.audit_logs"), "AUDIT_LOG_IMMUTABLE");
    const u = await invitedUser(root.id, ["APP01"]);
    await expectFail(as(u.id, (c) => c.query("insert into public.audit_logs(action) values ('fake')")), /permission denied/);
    expect(await selectAs(u.id, "select * from public.audit_logs")).toHaveLength(0);
  });
});

describe("メンター", () => {
  it("メンターロールだけでは利用者データを閲覧できない", async () => {
    const mentor = await invitedUser(root.id, ["APP01"], { role: "mentor" });
    const u = await invitedUser(root.id, ["APP01"]);
    await rpc(u.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", { x: 1 }]);
    expect(await selectAs(mentor.id, "select * from public.app_snapshots where user_id = $1", [u.id])).toHaveLength(0);
    expect(await selectAs(mentor.id, "select * from public.profiles where id = $1", [u.id])).toHaveLength(0);
    await expectFail(rpc(mentor.id, "admin_list_users", [null, null, 10, 0]), "FORBIDDEN");
  });

  it("メンター以外は担当者に設定できない", async () => {
    const notMentor = await invitedUser(root.id, ["APP01"]);
    const u = await invitedUser(root.id, ["APP01"]);
    await expectFail(rpc(root.id, "admin_set_mentor_assignment", [notMentor.id, u.id, "mentor", true]), "TARGET_NOT_MENTOR");
  });
});

describe("ダッシュボード", () => {
  it("KPIを集計できる", async () => {
    const stats = await rpc<Record<string, number>>(root.id, "admin_dashboard_stats");
    expect(stats.users_active).toBeGreaterThan(0);
    expect(stats).toHaveProperty("entitlements_by_app");
    expect(stats).toHaveProperty("transfers_failed");
  });

  it("新しいGoogleユーザーは profile 行を作られない", async () => {
    const u = await createAuthUser();
    expect(await sql("select * from public.profiles where id = $1", [u.id])).toHaveLength(0);
  });
});
