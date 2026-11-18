/**
 * アクセス判定（純粋関数・単体テスト対象）。
 * 入力の Access は DB の public.my_access() が「その時点のDB状態」から生成したもの。
 * JWT のメタデータは一切使わない。
 */
export type Role = "super_admin" | "admin" | "mentor";
export type AppAccess = { code: string; name_en: string; name_ja: string; granted: boolean };
export type Access = {
  authenticated: boolean;
  user_id?: string;
  email?: string;
  display_name?: string;
  status: "anonymous" | "not_invited" | "invited" | "active" | "suspended" | "revoked" | "deletion_pending" | "deleted";
  aal?: "aal1" | "aal2";
  admin_mfa_required?: boolean;
  roles: Role[];
  apps: AppAccess[];
};

export type Requirement =
  | { kind: "authenticated" }
  | { kind: "active" }
  | { kind: "admin"; superOnly?: boolean; skipMfa?: boolean }
  | { kind: "app"; code: string };

export type Denial = "login" | "not_invited" | "inactive" | "forbidden" | "mfa";
export type Decision = { ok: true } | { ok: false; reason: Denial };

export const isAdmin = (a: Access) => a.status === "active" && (a.roles.includes("super_admin") || a.roles.includes("admin"));
export const isSuperAdmin = (a: Access) => a.status === "active" && a.roles.includes("super_admin");

export function decide(access: Access | null | undefined, req: Requirement): Decision {
  if (!access || !access.authenticated) return { ok: false, reason: "login" };
  if (req.kind === "authenticated") return { ok: true };
  if (access.status === "not_invited") return { ok: false, reason: "not_invited" };
  if (access.status !== "active") return { ok: false, reason: "inactive" };
  if (req.kind === "active") return { ok: true };
  if (req.kind === "app") {
    return access.apps.some((a) => a.code === req.code && a.granted) ? { ok: true } : { ok: false, reason: "forbidden" };
  }
  // admin
  const allowed = req.superOnly ? isSuperAdmin(access) : isAdmin(access);
  if (!allowed) return { ok: false, reason: "forbidden" };
  if (!req.skipMfa && access.admin_mfa_required !== false && access.aal !== "aal2") return { ok: false, reason: "mfa" };
  return { ok: true };
}

/** HTTP ステータスへの対応（API 用） */
export function denialStatus(reason: Denial): number {
  return reason === "login" ? 401 : 403;
}

export const APP_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,31}$/;
