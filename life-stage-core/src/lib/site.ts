import "server-only";
import { headers } from "next/headers";

/** OAuth リダイレクト・招待リンクの基準URL。NEXT_PUBLIC_SITE_URL を優先（Hostヘッダー偽装対策） */
export async function siteUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") throw new Error("NEXT_PUBLIC_SITE_URL is required in production");
  const h = await headers();
  return `http://${h.get("host") ?? "localhost:3000"}`;
}

export const INVITE_COOKIE = "lsc_invite";
