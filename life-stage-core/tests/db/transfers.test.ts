/**
 * 連携転送・共有・本人出力・削除手続き（AT12〜AT16, AT18, AT19）
 * ※ APP本体は未実装のため、確定スナップショットは契約検証用RPCで登録する（モック検証）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { expectFail, invitedUser, rpc, selectAs, sql, superAdmin, validBlueprint, validGrowthPlan } from "./helpers";

type Snap = { snapshot_id: string; version: number; superseded_snapshot_id: string | null };
type Transfer = { transfer_id: string; status: string; error?: string; idempotent: boolean };
type U = { id: string; email: string };

let root: U;
beforeAll(async () => {
  root = await superAdmin();
});

describe("AT12 APP01 → APP02", () => {
  it("本人承認後に最新確定スナップショットがAPP02の受信箱へ届く", async () => {
    const u = await invitedUser(root.id, ["APP01", "APP02"]);
    const s = await rpc<Snap>(u.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", validBlueprint()]);
    const t = await rpc<Transfer>(u.id, "request_transfer", [s.snapshot_id, "APP02", "1.0", "2026-11"]);
    expect(t).toMatchObject({ status: "succeeded", idempotent: false });
    const inbox = await selectAs<{ payload: Record<string, unknown>; target_app: string }>(u.id, "select payload, target_app from public.transfer_inbox");
    expect(inbox).toHaveLength(1);
    expect(inbox[0].target_app).toBe("APP02");
    expect(inbox[0].payload).toMatchObject({ user_id: u.id, snapshot_id: s.snapshot_id, source_app: "APP01", schema_version: "1.0" });
    expect(inbox[0].payload).toHaveProperty("confirmed_at");
    // 同意が記録される
    const consents = await selectAs<{ consent_type: string }>(u.id, "select consent_type from public.consent_records");
    expect(consents.map((c) => c.consent_type)).toContain("data_transfer_app01_app02");
  });

  it("他人のスナップショットは転送できない・必須項目欠落は失敗として記録", async () => {
    const a = await invitedUser(root.id, ["APP01", "APP02"]);
    const b = await invitedUser(root.id, ["APP01", "APP02"]);
    const s = await rpc<Snap>(a.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", validBlueprint()]);
    await expectFail(rpc(b.id, "request_transfer", [s.snapshot_id, "APP02", "1.0", "2026-11"]), "NOT_FOUND");

    const bad = validBlueprint() as Record<string, unknown>;
    delete bad.life_purpose;
    const s2 = await rpc<Snap>(b.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", bad]);
    const t = await rpc<Transfer>(b.id, "request_transfer", [s2.snapshot_id, "APP02", "1.0", "2026-11"]);
    expect(t).toMatchObject({ status: "failed", error: "MISSING_FIELD:life_purpose" });
    expect(await selectAs(b.id, "select * from public.transfer_inbox")).toHaveLength(0);
  });

  it("経路・スキーマ版・同意の検証", async () => {
    const u = await invitedUser(root.id, ["APP01", "APP02", "APP03"]);
    const s = await rpc<Snap>(u.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", validBlueprint()]);
    await expectFail(rpc(u.id, "request_transfer", [s.snapshot_id, "APP03", "1.0", "2026-11"]), "INVALID_ROUTE");
    await expectFail(rpc(u.id, "request_transfer", [s.snapshot_id, "APP02", "2.0", "2026-11"]), "SCHEMA_VERSION_MISMATCH");
    await expectFail(rpc(u.id, "request_transfer", [s.snapshot_id, "APP02", "1.0", ""]), "CONSENT_REQUIRED");
  });
});

describe("AT13 APP02 → APP03", () => {
  it("6能力×10年=60セルの承認済み計画のみ受け付け、認定系フィールドの混入を拒否", async () => {
    const u = await invitedUser(root.id, ["APP02", "APP03"]);
    const ok = await rpc<Snap>(u.id, "confirm_snapshot", ["APP02", "growth_plan", "1.0", validGrowthPlan()]);
    expect((await rpc<Transfer>(u.id, "request_transfer", [ok.snapshot_id, "APP03", "1.0", "2026-11"])).status).toBe("succeeded");

    const seventy = validGrowthPlan();
    seventy.cells = [...seventy.cells, ...Array.from({ length: 10 }, (_, i) => ({ ability: "sales", year_index: String(i + 1), target: "x" }))];
    const s70 = await rpc<Snap>(u.id, "confirm_snapshot", ["APP02", "growth_plan", "1.0", seventy]);
    expect((await rpc<Transfer>(u.id, "request_transfer", [s70.snapshot_id, "APP03", "1.0", "2026-11"])).error).toBe("INVALID_CELLS:EXPECTED_6x10");

    const cert = { ...validGrowthPlan(), certifications: [{ ability: "education", level: 3 }] };
    const sc = await rpc<Snap>(u.id, "confirm_snapshot", ["APP02", "growth_plan", "1.0", cert]);
    expect((await rpc<Transfer>(u.id, "request_transfer", [sc.snapshot_id, "APP03", "1.0", "2026-11"])).error).toBe("CERTIFICATION_FIELDS_NOT_ALLOWED");
  });
});

describe("AT14 二重転送の防止", () => {
  it("同一スナップショット×転送先×スキーマ版の再送は冪等（受信箱は1件のまま）", async () => {
    const u = await invitedUser(root.id, ["APP01", "APP02"]);
    const s = await rpc<Snap>(u.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", validBlueprint()]);
    const results = await Promise.all(Array.from({ length: 4 }, () => rpc<Transfer>(u.id, "request_transfer", [s.snapshot_id, "APP02", "1.0", "2026-11"])));
    expect(new Set(results.map((r) => r.transfer_id)).size).toBe(1);
    expect(results.every((r) => r.status === "succeeded")).toBe(true);
    const again = await rpc<Transfer>(u.id, "request_transfer", [s.snapshot_id, "APP02", "1.0", "2026-11"]);
    expect(again.idempotent).toBe(true);
    expect(await sql("select * from public.transfer_inbox where user_id = $1", [u.id])).toHaveLength(1);
    expect(await sql("select * from public.data_transfers where user_id = $1", [u.id])).toHaveLength(1);
  });
});

describe("AT15 再試行時のデータ保持", () => {
  it("転送先権限がなく失敗→権限付与後に同じ転送IDで再試行成功。元データは変化しない", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    const bp = validBlueprint();
    const s = await rpc<Snap>(u.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", bp]);
    const t1 = await rpc<Transfer>(u.id, "request_transfer", [s.snapshot_id, "APP02", "1.0", "2026-11"]);
    expect(t1).toMatchObject({ status: "failed", error: "TARGET_APP_ACCESS_DENIED" });

    await rpc(root.id, "admin_set_entitlement", [u.id, "APP02", true, null]);
    const t2 = await rpc<Transfer>(u.id, "retry_transfer", [t1.transfer_id]);
    expect(t2).toMatchObject({ transfer_id: t1.transfer_id, status: "succeeded" });
    const [row] = await sql<{ attempt_count: number; last_error: string | null }>("select attempt_count, last_error from public.data_transfers where id = $1", [t1.transfer_id]);
    expect(row).toEqual({ attempt_count: 2, last_error: null });
    const [snap] = await sql<{ payload: unknown; superseded_at: unknown }>("select payload, superseded_at from public.app_snapshots where id = $1", [s.snapshot_id]);
    expect(snap.payload).toEqual(bp);
    expect(snap.superseded_at).toBeNull();
  });

  it("元データが更新されると旧転送は要再確認になり、受信済みデータは自動上書きされない", async () => {
    const u = await invitedUser(root.id, ["APP01", "APP02"]);
    const s1 = await rpc<Snap>(u.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", validBlueprint()]);
    const t1 = await rpc<Transfer>(u.id, "request_transfer", [s1.snapshot_id, "APP02", "1.0", "2026-11"]);
    const s2 = await rpc<Snap>(u.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", { ...validBlueprint(), life_purpose: "更新後" }]);
    expect(s2).toMatchObject({ version: 2, superseded_snapshot_id: s1.snapshot_id });
    const [t] = await sql<{ source_superseded_at: unknown }>("select source_superseded_at from public.data_transfers where id = $1", [t1.transfer_id]);
    expect(t.source_superseded_at).not.toBeNull();
    await expectFail(rpc(u.id, "request_transfer", [s1.snapshot_id, "APP02", "1.0", "2026-11"]), "SNAPSHOT_SUPERSEDED");
    expect(await sql("select * from public.transfer_inbox where user_id = $1", [u.id])).toHaveLength(1);
    // 本人が再確認して新しい版を転送すると、受信箱に別レコードとして追加
    await rpc(u.id, "request_transfer", [s2.snapshot_id, "APP02", "1.0", "2026-11"]);
    expect(await sql("select * from public.transfer_inbox where user_id = $1", [u.id])).toHaveLength(2);
  });
});

describe("AT16 本人による共有と撤回", () => {
  it("担当メンターに明示共有した範囲だけ閲覧でき、撤回・担当解除・期限切れで閲覧不可", async () => {
    const mentor = await invitedUser(root.id, ["APP01"], { role: "mentor" });
    const outsider = await invitedUser(root.id, ["APP01"], { role: "mentor" });
    const u = await invitedUser(root.id, ["APP01"]);
    const s = await rpc<Snap>(u.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", validBlueprint()]);

    // 担当関係がない相手へは共有できない
    await expectFail(rpc(u.id, "create_share", [mentor.id, "APP01", "app_snapshot", s.snapshot_id, {}, "read", null]), "SHARE_TARGET_NOT_ALLOWED");
    await rpc(root.id, "admin_set_mentor_assignment", [mentor.id, u.id, "mentor", true]);
    const targets = await rpc<{ mentor_id: string }[]>(u.id, "my_share_targets");
    expect(targets.map((t) => t.mentor_id)).toEqual([mentor.id]);

    // 共有前は閲覧不可
    expect(await selectAs(mentor.id, "select * from public.app_snapshots where id = $1", [s.snapshot_id])).toHaveLength(0);
    const share = await rpc<{ share_id: string }>(u.id, "create_share", [mentor.id, "APP01", "app_snapshot", s.snapshot_id, { items: ["life_purpose"] }, "read", null]);
    expect(await selectAs(mentor.id, "select * from public.app_snapshots where id = $1", [s.snapshot_id])).toHaveLength(1);
    expect(await selectAs(outsider.id, "select * from public.app_snapshots where id = $1", [s.snapshot_id])).toHaveLength(0);
    // メンターは共有元の他データ（権限・同意）は見えない
    expect(await selectAs(mentor.id, "select * from public.app_entitlements where user_id = $1", [u.id])).toHaveLength(0);

    // 撤回
    await rpc(u.id, "revoke_share", [share.share_id]);
    expect(await selectAs(mentor.id, "select * from public.app_snapshots where id = $1", [s.snapshot_id])).toHaveLength(0);

    // 担当解除で閲覧不可
    const share2 = await rpc<{ share_id: string }>(u.id, "create_share", [mentor.id, "APP01", "app_snapshot", s.snapshot_id, {}, "read", null]);
    expect(await selectAs(mentor.id, "select * from public.app_snapshots where id = $1", [s.snapshot_id])).toHaveLength(1);
    await rpc(root.id, "admin_set_mentor_assignment", [mentor.id, u.id, "mentor", false]);
    expect(await selectAs(mentor.id, "select * from public.app_snapshots where id = $1", [s.snapshot_id])).toHaveLength(0);
    expect(await selectAs(mentor.id, "select * from public.data_shares where id = $1", [share2.share_id])).toHaveLength(0);

    // 期限切れ
    await rpc(root.id, "admin_set_mentor_assignment", [mentor.id, u.id, "trainer", true]);
    const share3 = await rpc<{ share_id: string }>(u.id, "create_share", [mentor.id, "APP01", "app_snapshot", s.snapshot_id, {}, "read", new Date(Date.now() + 60000).toISOString()]);
    expect(await selectAs(mentor.id, "select * from public.app_snapshots where id = $1", [s.snapshot_id])).toHaveLength(1);
    await sql("update public.data_shares set expires_at = now() - interval '1 second' where id = $1", [share3.share_id]);
    expect(await selectAs(mentor.id, "select * from public.app_snapshots where id = $1", [s.snapshot_id])).toHaveLength(0);

    const actions = (await sql<{ action: string }>("select action from public.audit_logs where actor_id = $1 and action like 'share.%' order by id", [u.id])).map((r) => r.action);
    expect(actions).toEqual(["share.create", "share.revoke", "share.create", "share.create"]);
  });

  it("他人のスナップショットを共有対象に指定できない", async () => {
    const mentor = await invitedUser(root.id, ["APP01"], { role: "mentor" });
    const a = await invitedUser(root.id, ["APP01"]);
    const b = await invitedUser(root.id, ["APP01"]);
    await rpc(root.id, "admin_set_mentor_assignment", [mentor.id, b.id, "mentor", true]);
    const s = await rpc<Snap>(a.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", validBlueprint()]);
    await expectFail(rpc(b.id, "create_share", [mentor.id, "APP01", "app_snapshot", s.snapshot_id, {}, "read", null]), "NOT_FOUND");
  });
});

describe("AT18 本人データの出力", () => {
  it("本人のデータ一式をJSONで出力でき、他人のデータは含まれない", async () => {
    const a = await invitedUser(root.id, ["APP01"]);
    const b = await invitedUser(root.id, ["APP01"]);
    await rpc(a.id, "record_consent", ["privacy", "2026-11", null]);
    await rpc(a.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", validBlueprint()]);
    await rpc(b.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", { owner: "b" }]);
    const out = await rpc<Record<string, unknown[]> & { profile: { id: string } }>(a.id, "my_export");
    expect(out.profile.id).toBe(a.id);
    expect(out.snapshots).toHaveLength(1);
    expect(out.consents).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain(b.id);
    expect(await sql("select * from public.audit_logs where actor_id = $1 and action = 'data.export'", [a.id])).toHaveLength(1);
  });
});

describe("AT19 削除方針（二段階確認）", () => {
  it("本人請求→Super Admin がメール再入力で確定→アクセス遮断。データは保持（物理削除は運用手順）", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    await rpc(u.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", validBlueprint()]);
    const req = await rpc<{ request_id: string }>(u.id, "request_own_deletion", ["退会希望"]);
    await expectFail(rpc(u.id, "request_own_deletion", ["重複"]), "DELETION_ALREADY_REQUESTED");
    await expectFail(rpc(root.id, "admin_decide_deletion", [req.request_id, "confirm", "wrong@example.com"]), "CONFIRMATION_MISMATCH");
    await rpc(root.id, "admin_decide_deletion", [req.request_id, "confirm", u.email]);
    expect((await rpc<{ status: string }>(u.id, "my_access")).status).toBe("deletion_pending");
    expect(await rpc(u.id, "check_app_access", ["APP01"])).toBe(false);
    expect(await sql("select * from public.app_snapshots where user_id = $1", [u.id])).toHaveLength(1);

    // 取消で元の状態へ戻る
    await rpc(root.id, "admin_decide_deletion", [req.request_id, "cancel", null]);
    expect((await rpc<{ status: string }>(u.id, "my_access")).status).toBe("active");
  });

  it("Admin は申請のみ可能で、確定は Super Admin のみ", async () => {
    const admin = await invitedUser(root.id, [], { role: "admin" });
    const u = await invitedUser(admin.id, ["APP01"]);
    const req = await rpc<{ request_id: string }>(admin.id, "admin_request_deletion", [u.id, "本人からの電話依頼"]);
    await expectFail(rpc(admin.id, "admin_decide_deletion", [req.request_id, "confirm", u.email]), "FORBIDDEN");
    await expectFail(rpc(root.id, "admin_decide_deletion", [req.request_id, "confirm", root.email]), "CONFIRMATION_MISMATCH");
  });
});
