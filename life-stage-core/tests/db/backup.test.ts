/**
 * AT20 バックアップ復元
 * pg_dump（カスタム形式）で取得 → 別DBへ pg_restore → 全業務テーブルの件数・内容ハッシュ一致、
 * 復元先でも RLS・関数・監査ログ不変性が機能することを確認する。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { invitedUser, rpc, superAdmin, validBlueprint, pool } from "./helpers";

const ADMIN_URL = process.env.LSC_TEST_ADMIN_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const SRC_DB = process.env.LSC_TEST_DB ?? "lsc_test";
const DST_DB = `${SRC_DB}_restore`;
const PGBIN = process.env.PGBIN ?? execFileSync("bash", ["-c", "ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1"]).toString().trim();
const url = (db: string) => ADMIN_URL.replace(/\/[^/]*$/, `/${db}`);

const TABLES = ["apps", "profiles", "admin_roles", "admin_user_scopes", "mentor_assignments", "invitations", "invitation_apps",
  "app_entitlements", "consent_records", "data_shares", "app_snapshots", "data_transfers", "transfer_inbox",
  "deletion_requests", "app_settings", "audit_logs"];

async function fingerprint(db: string) {
  const c = new Client({ connectionString: url(db) });
  await c.connect();
  const out: Record<string, string> = {};
  for (const t of TABLES) {
    const r = await c.query(`select count(*)::text || ':' || coalesce(md5(string_agg(x::text, '|' order by x::text)), '') as f from public.${t} x`);
    out[t] = r.rows[0].f;
  }
  await c.end();
  return out;
}

describe("AT20 バックアップ・復元", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lsc-backup-"));
  const file = path.join(dir, "backup.dump");

  beforeAll(async () => {
    const root = await superAdmin();
    const u = await invitedUser(root.id, ["APP01", "APP02"]);
    const s = await rpc<{ snapshot_id: string }>(u.id, "confirm_snapshot", ["APP01", "life_blueprint", "1.0", validBlueprint()]);
    await rpc(u.id, "request_transfer", [s.snapshot_id, "APP02", "1.0", "2026-11"]);
  });

  afterAll(async () => {
    const c = new Client({ connectionString: ADMIN_URL });
    await c.connect();
    await c.query(`DROP DATABASE IF EXISTS ${DST_DB} WITH (FORCE)`);
    await c.end();
    await pool.end();
  });

  it("取得したバックアップから別DBへ完全に復元できる", async () => {
    execFileSync(path.join(PGBIN, "pg_dump"), ["--format=custom", "--no-owner", "--file", file, url(SRC_DB)]);
    expect(statSync(file).size).toBeGreaterThan(1000);

    const c = new Client({ connectionString: ADMIN_URL });
    await c.connect();
    await c.query(`DROP DATABASE IF EXISTS ${DST_DB} WITH (FORCE)`);
    await c.query(`CREATE DATABASE ${DST_DB}`);
    await c.end();
    execFileSync(path.join(PGBIN, "pg_restore"), ["--no-owner", "--exit-on-error", "--dbname", url(DST_DB), file]);

    const [src, dst] = await Promise.all([fingerprint(SRC_DB), fingerprint(DST_DB)]);
    expect(dst).toEqual(src);
    expect(Number(dst.audit_logs.split(":")[0])).toBeGreaterThan(0);
  });

  it("復元先でも RLS・権限関数・監査ログの不変性が有効", async () => {
    const c = new Client({ connectionString: url(DST_DB) });
    await c.connect();
    const rls = await c.query(`select count(*)::int as n from pg_tables where schemaname = 'public' and rowsecurity = false`);
    expect(rls.rows[0].n).toBe(0);
    await expect(c.query("update public.audit_logs set action = 'x'")).rejects.toThrow(/AUDIT_LOG_IMMUTABLE/);
    const fn = await c.query(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                               where n.nspname = 'public' and p.proname in ('accept_invitation', 'admin_set_user_status', 'my_access')`);
    expect(fn.rows[0].n).toBe(3);
    await c.end();
  });
});
