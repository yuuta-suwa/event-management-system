import "server-only";
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decide, denialStatus, type Access, type Requirement } from "@/lib/access-policy";

/**
 * 現在のアクセス状態を DB（public.my_access）から取得。1リクエスト内でキャッシュ。
 * 停止・権限変更は次のリクエストから即時に反映される。
 */
export const getAccess = cache(async (): Promise<Access> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { authenticated: false, status: "anonymous", roles: [], apps: [] };
  const { data, error } = await supabase.rpc("my_access");
  if (error || !data) return { authenticated: false, status: "anonymous", roles: [], apps: [] };
  return data as Access;
});

/** ページ用ガード：要件を満たさなければ遷移／403 */
export async function requirePage(req: Requirement, currentPath = "/"): Promise<Access> {
  const access = await getAccess();
  const d = decide(access, req);
  if (d.ok) return access;
  switch (d.reason) {
    case "login":
      redirect(`/login?next=${encodeURIComponent(currentPath)}`);
    case "not_invited":
    case "inactive":
      redirect("/status");
    case "mfa":
      redirect(`/admin/mfa?next=${encodeURIComponent(currentPath)}`);
    default:
      forbidden();
  }
}

/** API 用ガード：要件を満たさなければ JSON エラーレスポンス */
export async function requireApi(req: Requirement): Promise<{ access: Access } | { response: NextResponse }> {
  const access = await getAccess();
  const d = decide(access, req);
  if (d.ok) return { access };
  const code = { login: "NOT_AUTHENTICATED", not_invited: "NOT_INVITED", inactive: "ACCOUNT_NOT_ACTIVE", forbidden: "FORBIDDEN", mfa: "MFA_REQUIRED" }[d.reason];
  return { response: NextResponse.json({ error: { code } }, { status: denialStatus(d.reason) }) };
}
