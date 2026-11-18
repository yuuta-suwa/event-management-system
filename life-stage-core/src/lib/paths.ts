/** 認証が必要なパス（楽観的チェック用。最終判定はサーバー／DB） */
const PROTECTED_PREFIXES = ["/admin", "/account", "/apps", "/api"];
const PUBLIC_API = new Set(["/api/health"]);

export function isProtectedPath(path: string): boolean {
  if (PUBLIC_API.has(path)) return false;
  return PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

/**
 * ログイン後の遷移先を検証（オープンリダイレクト防止）。
 * 同一オリジンの相対パスのみ許可し、それ以外は既定値にする。
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(next)) return fallback;
  try {
    const u = new URL(next, "http://localhost");
    if (u.origin !== "http://localhost") return fallback;
    return u.pathname + u.search;
  } catch {
    return fallback;
  }
}
