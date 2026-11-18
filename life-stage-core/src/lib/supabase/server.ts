import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * サーバー用 Supabase クライアント（利用者本人のセッションで動作し、RLS が適用される）。
 * 管理操作も本人セッションで SECURITY DEFINER RPC を呼び、権限確認はDB側で行う。
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = publicEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component から呼ばれた場合は書き込めない。proxy.ts がセッションを更新する。
        }
      },
    },
  });
}
