/**
 * 招待・認証（AT01〜AT04、SEC01/SEC02）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createAuthUser, expectFail, invitedUser, rpc, selectAs, sql, superAdmin, uniqueEmail } from "./helpers";

type Access = { status: string; apps: { code: string; granted: boolean }[]; roles: string[] };
type Inv = { token: string; invitation_id: string; expires_at: string };
type Accept = { ok: boolean; code: string; apps?: string[] };

let root: { id: string; email: string };
beforeAll(async () => {
  root = await superAdmin();
});

describe("AT01 未招待ユーザーの拒否", () => {
  it("Googleログインに成功しても招待がなければ not_invited でアプリ利用不可", async () => {
    const u = await createAuthUser();
    const access = await rpc<Access>(u.id, "my_access");
    expect(access.status).toBe("not_invited");
    expect(access.apps.every((a) => !a.granted)).toBe(true);
    expect(await rpc<boolean>(u.id, "check_app_access", ["APP01"])).toBe(false);
    // テーブルも一切見えない
    expect(await selectAs(u.id, "select * from public.profiles")).toHaveLength(0);
    expect(await selectAs(u.id, "select * from public.apps")).toHaveLength(0);
    // 本人操作RPCも拒否
    await expectFail(rpc(u.id, "my_export"), "ACCOUNT_NOT_ACTIVE");
  });

  it("推測したトークンでは受諾できず、失敗が監査記録される", async () => {
    const u = await createAuthUser();
    const r = await rpc<Accept>(u.id, "accept_invitation", ["guessed-token"]);
    expect(r).toMatchObject({ ok: false, code: "INVITATION_INVALID" });
    const logs = await sql("select * from public.audit_logs where actor_id = $1 and action = 'invitation.accept' and success = false", [u.id]);
    expect(logs).toHaveLength(1);
  });

  it("未ログイン（anon）はRPCもテーブルも利用できない", async () => {
    await expectFail(rpc(null, "accept_invitation", ["x"]), /permission denied/);
    await expectFail(selectAs(null, "select * from public.profiles"), /permission denied/);
    await expectFail(selectAs(null, "select * from public.audit_logs"), /permission denied/);
  });

  it("総当たり：1時間に10回失敗すると TOO_MANY_ATTEMPTS", async () => {
    const u = await createAuthUser();
    for (let i = 0; i < 10; i++) await rpc(u.id, "accept_invitation", [`bad-${i}`]);
    const r = await rpc<Accept>(u.id, "accept_invitation", ["bad-11"]);
    expect(r.code).toBe("TOO_MANY_ATTEMPTS");
  });
});

describe("AT02 招待された本人の登録", () => {
  it("招待→本人のGoogleアカウントで受諾→指定アプリのみ利用可能", async () => {
    const email = uniqueEmail();
    const inv = await rpc<Inv>(root.id, "admin_create_invitation", [email, ["APP01"], null, "test", null]);
    expect(inv.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // 有効期限の初期値は72時間
    const hours = (new Date(inv.expires_at).getTime() - Date.now()) / 3600000;
    expect(hours).toBeGreaterThan(71.9);
    expect(hours).toBeLessThanOrEqual(72);

    const u = await createAuthUser({ email: email.toUpperCase() });
    const r = await rpc<Accept>(u.id, "accept_invitation", [inv.token]);
    expect(r).toMatchObject({ ok: true, apps: ["APP01"] });
    const access = await rpc<Access>(u.id, "my_access");
    expect(access.status).toBe("active");
    expect(access.apps.find((a) => a.code === "APP01")?.granted).toBe(true);
    expect(access.apps.find((a) => a.code === "APP02")?.granted).toBe(false);
    expect(access.roles).toEqual([]);
  });

  it("DBには生トークンを保存せずハッシュのみ。管理者もハッシュ列を読めない", async () => {
    const inv = await rpc<Inv>(root.id, "admin_create_invitation", [uniqueEmail(), ["APP01"], null, null, null]);
    const rows = await sql<{ token_hash: Buffer }>("select token_hash from public.invitations where id = $1", [inv.invitation_id]);
    expect(rows[0].token_hash.length).toBe(32);
    const dump = JSON.stringify(await sql("select * from public.invitations where id = $1", [inv.invitation_id]));
    expect(dump).not.toContain(inv.token);
    await expectFail(selectAs(root.id, "select token_hash from public.invitations"), /permission denied/);
  });

  it("招待先と異なるGoogleアカウントでは受諾できない（招待は消費されない）", async () => {
    const inv = await rpc<Inv>(root.id, "admin_create_invitation", [uniqueEmail(), ["APP01"], null, null, null]);
    const other = await createAuthUser();
    expect((await rpc<Accept>(other.id, "accept_invitation", [inv.token])).code).toBe("EMAIL_MISMATCH");
    const [row] = await sql<{ status: string }>("select status from public.invitations where id = $1", [inv.invitation_id]);
    expect(row.status).toBe("pending");
  });

  it("メール未確認・Google以外の認証は拒否", async () => {
    const e1 = uniqueEmail();
    const inv1 = await rpc<Inv>(root.id, "admin_create_invitation", [e1, ["APP01"], null, null, null]);
    const u1 = await createAuthUser({ email: e1, confirmed: false });
    expect((await rpc<Accept>(u1.id, "accept_invitation", [inv1.token])).code).toBe("EMAIL_NOT_VERIFIED");
    const e2 = uniqueEmail();
    const inv2 = await rpc<Inv>(root.id, "admin_create_invitation", [e2, ["APP01"], null, null, null]);
    const u2 = await createAuthUser({ email: e2, google: false });
    expect((await rpc<Accept>(u2.id, "accept_invitation", [inv2.token])).code).toBe("PROVIDER_NOT_ALLOWED");
  });

  it("単回使用：同時に2回受諾しても成功は1回、権限付与も1件", async () => {
    const email = uniqueEmail();
    const inv = await rpc<Inv>(root.id, "admin_create_invitation", [email, ["APP01", "APP02"], null, null, null]);
    const u = await createAuthUser({ email });
    const results = await Promise.all(Array.from({ length: 5 }, () => rpc<Accept>(u.id, "accept_invitation", [inv.token])));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => ["INVITATION_USED", "ALREADY_MEMBER"].includes(r.code))).toBe(true);
    const ents = await sql("select * from public.app_entitlements where user_id = $1", [u.id]);
    expect(ents).toHaveLength(2);
    // 使用済みトークンの再利用も拒否
    expect((await rpc<Accept>(u.id, "accept_invitation", [inv.token])).code).toBe("INVITATION_USED");
  });

  it("同一メールの有効な招待は1件まで。既存メンバーへの招待は不可", async () => {
    const email = uniqueEmail();
    await rpc(root.id, "admin_create_invitation", [email, ["APP01"], null, null, null]);
    await expectFail(rpc(root.id, "admin_create_invitation", [email, ["APP02"], null, null, null]), "PENDING_INVITATION_EXISTS");
    const member = await invitedUser(root.id, ["APP01"]);
    await expectFail(rpc(root.id, "admin_create_invitation", [member.email, ["APP02"], null, null, null]), "ALREADY_MEMBER");
  });

  it("入力検証：不正メール・未選択・無効アプリ・期限範囲", async () => {
    await expectFail(rpc(root.id, "admin_create_invitation", ["not-an-email", ["APP01"], null, null, null]), "INVALID_EMAIL");
    await expectFail(rpc(root.id, "admin_create_invitation", [uniqueEmail(), [], null, null, null]), "NO_APPS_SELECTED");
    await expectFail(rpc(root.id, "admin_create_invitation", [uniqueEmail(), ["LIFE_ACCOUNTING"], null, null, null]), "INVALID_APP");
    await expectFail(rpc(root.id, "admin_create_invitation", [uniqueEmail(), ["APP01"], null, null, 500]), "INVALID_TTL");
  });
});

describe("AT03 招待期限切れ", () => {
  it("期限切れの招待は受諾できない。再発行すると新トークンで受諾できる", async () => {
    const email = uniqueEmail();
    const inv = await rpc<Inv>(root.id, "admin_create_invitation", [email, ["APP02"], null, null, null]);
    await sql("update public.invitations set expires_at = now() - interval '1 minute' where id = $1", [inv.invitation_id]);
    const u = await createAuthUser({ email });
    expect((await rpc<Accept>(u.id, "accept_invitation", [inv.token])).code).toBe("INVITATION_EXPIRED");
    expect((await rpc<Access>(u.id, "my_access")).status).toBe("not_invited");

    const re = await rpc<Inv>(root.id, "admin_reissue_invitation", [inv.invitation_id]);
    expect(re.token).not.toBe(inv.token);
    expect((await rpc<Accept>(u.id, "accept_invitation", [inv.token])).code).toBe("INVITATION_SUPERSEDED");
    expect((await rpc<Accept>(u.id, "accept_invitation", [re.token])).ok).toBe(true);
    const [old] = await sql<{ status: string }>("select status from public.invitations where id = $1", [inv.invitation_id]);
    expect(old.status).toBe("superseded");
    const [nw] = await sql<{ reissued_from: string }>("select reissued_from from public.invitations where id = $1", [re.invitation_id]);
    expect(nw.reissued_from).toBe(inv.invitation_id);
  });
});

describe("AT04 招待取り消し", () => {
  it("取り消した招待は受諾できない。受諾済み招待は再発行できない", async () => {
    const email = uniqueEmail();
    const inv = await rpc<Inv>(root.id, "admin_create_invitation", [email, ["APP03"], null, null, null]);
    await rpc(root.id, "admin_revoke_invitation", [inv.invitation_id, "誤送信"]);
    const u = await createAuthUser({ email });
    expect((await rpc<Accept>(u.id, "accept_invitation", [inv.token])).code).toBe("INVITATION_REVOKED");
    await expectFail(rpc(root.id, "admin_revoke_invitation", [inv.invitation_id, null]), "INVITATION_NOT_PENDING");

    const member = await invitedUser(root.id, ["APP01"]);
    await expectFail(rpc(root.id, "admin_reissue_invitation", [member.invitationId]), "INVITATION_ALREADY_ACCEPTED");
  });

  it("招待履歴（発行・取消・再発行・受諾）が監査ログに残る", async () => {
    const email = uniqueEmail();
    const inv = await rpc<Inv>(root.id, "admin_create_invitation", [email, ["APP01"], null, null, null]);
    await rpc(root.id, "admin_revoke_invitation", [inv.invitation_id, "test"]);
    const re = await rpc<Inv>(root.id, "admin_reissue_invitation", [inv.invitation_id]);
    const u = await createAuthUser({ email });
    await rpc(u.id, "accept_invitation", [re.token]);
    const actions = (await sql<{ action: string }>(
      "select action from public.audit_logs where target_id in ($1, $2) order by id", [inv.invitation_id, re.invitation_id],
    )).map((r) => r.action);
    expect(actions).toEqual(["invitation.create", "invitation.revoke", "invitation.reissue", "invitation.accept"]);
  });
});
