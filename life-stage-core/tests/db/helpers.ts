import { Pool, type PoolClient } from "pg";
import { randomUUID } from "node:crypto";

const ADMIN_URL = process.env.LSC_TEST_ADMIN_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const TEST_DB = process.env.LSC_TEST_DB ?? "lsc_test";
export const pool = new Pool({ connectionString: ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DB}`), max: 8 });

export type Aal = "aal1" | "aal2";
type Json = Record<string, unknown>;

/** スーパーユーザー（運用者 / SQL Editor 相当）でクエリ */
export async function sql<T = Json>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}

/** 認証済み利用者として実行（Supabase の PostgREST と同じく role と request.jwt.claims を設定） */
export async function as<T>(uid: string | null, fn: (c: PoolClient) => Promise<T>, aal: Aal = "aal2"): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    if (uid) {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: uid, role: "authenticated", aal }),
      ]);
    } else {
      await c.query("set local role anon");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    }
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** 利用者として SELECT（RLS が適用された結果） */
export async function selectAs<T = Json>(uid: string | null, text: string, params: unknown[] = [], aal: Aal = "aal2") {
  return as(uid, async (c) => (await c.query(text, params)).rows as T[], aal);
}

/** RPC 呼び出し（PostgREST の /rpc 相当） */
export async function rpc<T = Json>(uid: string | null, fn: string, args: unknown[] = [], aal: Aal = "aal2"): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  return as(uid, async (c) => (await c.query(`select public.${fn}(${placeholders}) as r`, args)).rows[0].r as T, aal);
}

/** 期待するエラーコードで失敗することを確認 */
export async function expectFail(p: Promise<unknown>, code: string | RegExp) {
  try {
    await p;
  } catch (e) {
    const msg = (e as Error).message;
    if (typeof code === "string" ? msg.includes(code) : code.test(msg)) return msg;
    throw new Error(`expected ${code} but got: ${msg}`);
  }
  throw new Error(`expected failure ${code} but succeeded`);
}

export const uniqueEmail = (p = "user") => `${p}-${randomUUID().slice(0, 8)}@example.com`;

/** Google 認証済みユーザー（auth.users）を作成 */
export async function createAuthUser(opts: { email?: string; google?: boolean; confirmed?: boolean } = {}) {
  const email = (opts.email ?? uniqueEmail()).toLowerCase();
  const [u] = await sql<{ id: string }>(
    "insert into auth.users(email, email_confirmed_at) values ($1, $2) returning id",
    [email, opts.confirmed === false ? null : new Date()],
  );
  if (opts.google !== false) await sql("insert into auth.identities(user_id, provider) values ($1, 'google')", [u.id]);
  await sql("insert into auth.sessions(user_id) values ($1)", [u.id]);
  return { id: u.id, email };
}

/** 初期 Super Admin（テスト実行中は1名を共有） */
let superAdminCache: { id: string; email: string } | null = null;
export async function superAdmin() {
  if (superAdminCache) return superAdminCache;
  const existing = await sql<{ id: string; email: string }>(
    `select p.id, p.email from public.admin_roles r join public.profiles p on p.id = r.user_id
      where r.role = 'super_admin' and r.revoked_at is null and p.status = 'active' order by r.granted_at limit 1`,
  );
  if (existing[0]) return (superAdminCache = existing[0]);
  const email = uniqueEmail("root");
  const [{ r }] = await sql<{ r: { token: string } }>("select private.bootstrap_super_admin($1) as r", [email]);
  const u = await createAuthUser({ email });
  const res = await rpc<{ ok: boolean }>(u.id, "accept_invitation", [r.token]);
  if (!res.ok) throw new Error("bootstrap failed " + JSON.stringify(res));
  return (superAdminCache = u);
}

/** 招待→Googleログイン→受諾まで行った利用者を作成 */
export async function invitedUser(inviter: string, apps: string[], opts: { role?: string | null } = {}) {
  const email = uniqueEmail();
  const inv = await rpc<{ token: string; invitation_id: string }>(inviter, "admin_create_invitation", [
    email, apps, opts.role ?? null, null, null,
  ]);
  const u = await createAuthUser({ email });
  const res = await rpc<{ ok: boolean; code: string }>(u.id, "accept_invitation", [inv.token]);
  if (!res.ok) throw new Error("accept failed " + res.code);
  return { ...u, invitationId: inv.invitation_id };
}

export const validBlueprint = () => ({
  blueprint_id: randomUUID(),
  life_purpose: "大切な人と豊かに生きる",
  priority_desires: ["家族旅行", "独立", "学び"],
  budget_summary: { monthly_required: 400000, target_assets: 30000000, target_year: 2036 },
  vision_board_asset_refs: [],
  gap_analysis: { money: "差額あり", time: "週10時間", relations: "協力者3名", capabilities: "育成力" },
  goals: [{ type: "long", description: "独立", deadline: "2031-12-31" }],
  priority_capabilities: ["education", "development"],
  first_action: "毎朝30分学習",
  first_action_date: "2026-12-01",
  consent_version: "2026-11",
});

export const validGrowthPlan = () => {
  const abilities = ["attraction", "recruitment", "education", "development", "operations", "management"];
  const cells = abilities.flatMap((ability) =>
    Array.from({ length: 10 }, (_, i) => ({ ability, year_index: String(i + 1), target: `${ability} Y${i + 1}` })),
  );
  return {
    plan_id: randomUUID(),
    vision_version: 1,
    start_year: 2027,
    mode: "CONVICTION",
    focus_abilities: ["education"],
    cells,
    provisional_assessment: { education: 2 },
    approved_at: new Date().toISOString(),
  };
};
