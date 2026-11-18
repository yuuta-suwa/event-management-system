// 配布物（ブラウザに届く .next/static）に秘密鍵・service_role・ソースマップが含まれていないか検査する
// （LEI APP HUB の check-bundle-secrets を Next.js 向けに移植）
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = ".next/static";
const PATTERNS = [
  [/sb_secret_[A-Za-z0-9_-]{8,}/, "Supabase secret key"],
  [/GOCSPX-[A-Za-z0-9_-]{10,}/, "Google OAuth client secret"],
  [/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|GOOGLE_CLIENT_SECRET/, "秘密用の環境変数名"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "秘密鍵 PEM"],
  [/postgres(ql)?:\/\/[^\s"']+:[^\s"']+@/, "DB 接続文字列（パスワード付き）"],
];

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

if (!existsSync(ROOT)) {
  console.error(`NG: ${ROOT} がありません。先に pnpm build を実行してください`);
  process.exit(1);
}
let bad = 0;
let files = 0;
for (const file of walk(ROOT)) {
  files++;
  if (file.endsWith(".map")) {
    console.error(`NG: ソースマップ ${file} が配布物に含まれています`);
    bad++;
    continue;
  }
  const text = readFileSync(file, "utf8");
  for (const [re, label] of PATTERNS) {
    if (re.test(text)) {
      console.error(`NG: ${file} に ${label} が含まれています`);
      bad++;
    }
  }
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], "base64url").toString());
      if (payload.role && payload.role !== "anon") {
        console.error(`NG: ${file} に role=${payload.role} の JWT が含まれています`);
        bad++;
      }
    } catch {}
  }
}
if (bad) process.exit(1);
console.log(`OK: ${ROOT}（${files}ファイル）に秘密鍵・service_role・ソースマップは見つかりませんでした`);
