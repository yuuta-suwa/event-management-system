"use client";
import { createBrowserClient } from "@supabase/ssr";

/** ブラウザ用（MFA 登録・検証のみで使用）。publishable key だけを使う。 */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
