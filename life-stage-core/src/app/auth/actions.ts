"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/paths";
import { INVITE_COOKIE, siteUrl } from "@/lib/site";
import { errorCode } from "@/lib/errors";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

async function startGoogle(next: string): Promise<never> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?error=AUTH_FAILED");
  redirect(data.url);
}

/** Google でログイン */
export async function signInWithGoogle(formData: FormData) {
  await startGoogle(safeNextPath(String(formData.get("next") ?? ""), "/"));
}

/** 招待リンクから：トークンを短時間の HttpOnly Cookie に保持して Google ログインへ */
export async function startInviteLogin(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!TOKEN_RE.test(token)) redirect("/invite/result?code=INVITATION_INVALID");
  const store = await cookies();
  store.set(INVITE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/invite",
    maxAge: 15 * 60,
  });
  await startGoogle("/invite/accept");
}

/** 既にログイン済みの場合はその場で受諾 */
export async function acceptInviteNow(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!TOKEN_RE.test(token)) redirect("/invite/result?code=INVITATION_INVALID");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  const code = error ? errorCode(error) : String((data as { code?: string })?.code ?? "UNKNOWN");
  redirect(`/invite/result?code=${encodeURIComponent(code)}`);
}

/** ログアウト（別アカウントで受諾し直す場合にも使用） */
export async function signOut(formData: FormData) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(safeNextPath(String(formData.get("next") ?? ""), "/"));
}
