/**
 * DBテスト用グローバルセットアップ
 * ローカル PostgreSQL（scripts/local-db.sh start）上にテスト専用DBを毎回作り直し、
 * Supabase 互換シム＋全マイグレーションを適用する。
 */
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const ADMIN_URL = process.env.LSC_TEST_ADMIN_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const TEST_DB = process.env.LSC_TEST_DB ?? "lsc_test";

export default async function setup() {
  if (!/^lsc_test[a-z0-9_]*$/.test(TEST_DB)) throw new Error("LSC_TEST_DB must start with lsc_test");
  const admin = new Client({ connectionString: ADMIN_URL });
  try {
    await admin.connect();
  } catch (e) {
    throw new Error(`ローカルPostgreSQLに接続できません。先に "pnpm db:local:start" を実行してください (${(e as Error).message})`);
  }
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const db = new Client({ connectionString: ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DB}`) });
  await db.connect();
  await db.query(readFileSync(path.join(ROOT, "supabase/local/supabase_shim.sql"), "utf8"));
  // Supabase の旧既定（public の新規テーブル・関数を anon/authenticated へ自動 GRANT）を再現し、
  // その状態でもマイグレーション適用後に不要な権限が残らないことを検証する（LEI APP HUB の手法）
  await db.query(`
    alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
  `);
  const dir = path.join(ROOT, "supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.query(readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    }
  }
  await db.end();
}
