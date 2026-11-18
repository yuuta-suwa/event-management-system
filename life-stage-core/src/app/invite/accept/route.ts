import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { INVITE_COOKIE } from "@/lib/site";
import { errorCode } from "@/lib/errors";

/**
 * Google ログイン直後に呼ばれ、Cookie に保持した招待トークンで受諾する。
 * 照合（認証済みメール＝招待先）・単回消費・権限付与はすべて DB の accept_invitation が原子的に行う。
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(INVITE_COOKIE)?.value;
  let code = "INVITATION_INVALID";
  if (token) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
    code = error ? errorCode(error) : String((data as { code?: string })?.code ?? "UNKNOWN");
  }
  const res = NextResponse.redirect(new URL(`/invite/result?code=${encodeURIComponent(code)}`, request.nextUrl.origin));
  res.cookies.set(INVITE_COOKIE, "", { path: "/invite", maxAge: 0 });
  return res;
}
