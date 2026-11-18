"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorCode } from "@/lib/errors";
import { requirePage } from "@/lib/access";
import { siteUrl } from "@/lib/site";
import { safeNextPath } from "@/lib/paths";

/**
 * 管理操作の Server Actions。
 * 画面側のガードに加え、すべての権限確認・MFA(aal2)確認・監査記録は DB の RPC が強制する。
 * （UI を経由しない直接呼び出しでも同じ制約がかかる）
 */

function back(formData: FormData, fallback: string, q: string): never {
  const to = safeNextPath(String(formData.get("back") ?? ""), fallback);
  redirect(`${to}${to.includes("?") ? "&" : "?"}${q}`);
}

async function call(fn: string, args: Record<string, unknown>) {
  await requirePage({ kind: "admin" }, "/admin");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  return { data, code: error ? errorCode(error) : null };
}

const uuid = z.uuid();
const reason = (v: FormDataEntryValue | null) => (String(v ?? "").trim().slice(0, 500) || null);

// ---------------- 招待 ----------------
export type InviteState = { ok: boolean; code?: string; link?: string; email?: string; expiresAt?: string } | null;

export async function createInvitation(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const email = String(formData.get("email") ?? "").trim();
  const apps = formData.getAll("apps").map(String);
  const role = String(formData.get("grant_role") ?? "") || null;
  const ttl = Number(formData.get("ttl_hours") || 0) || null;
  const note = reason(formData.get("note"));
  const { data, code } = await call("admin_create_invitation", {
    p_email: email, p_apps: apps, p_grant_role: role, p_note: note, p_ttl_hours: ttl,
  });
  if (code) return { ok: false, code };
  const d = data as { token: string; email: string; expires_at: string };
  revalidatePath("/admin/invitations");
  return { ok: true, link: `${await siteUrl()}/invite?token=${d.token}`, email: d.email, expiresAt: d.expires_at };
}

export async function reissueInvitation(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const id = uuid.safeParse(formData.get("invitation_id"));
  if (!id.success) return { ok: false, code: "NOT_FOUND" };
  const { data, code } = await call("admin_reissue_invitation", { p_invitation_id: id.data });
  if (code) return { ok: false, code };
  const d = data as { token: string; email: string; expires_at: string };
  revalidatePath("/admin/invitations");
  return { ok: true, link: `${await siteUrl()}/invite?token=${d.token}`, email: d.email, expiresAt: d.expires_at };
}

export async function revokeInvitation(formData: FormData) {
  const id = uuid.safeParse(formData.get("invitation_id"));
  if (!id.success) back(formData, "/admin/invitations", "error=NOT_FOUND");
  const { code } = await call("admin_revoke_invitation", { p_invitation_id: id.data, p_reason: reason(formData.get("reason")) });
  back(formData, "/admin/invitations", code ? `error=${code}` : "ok=revoked");
}

// ---------------- 権限・状態 ----------------
export async function setEntitlement(formData: FormData) {
  const id = uuid.safeParse(formData.get("user_id"));
  const app = String(formData.get("app_code") ?? "");
  if (!id.success || !/^[A-Z][A-Z0-9_]{1,31}$/.test(app)) back(formData, "/admin/permissions", "error=NOT_FOUND");
  const { code } = await call("admin_set_entitlement", {
    p_user_id: id.data, p_app_code: app, p_grant: formData.get("grant") === "true", p_reason: reason(formData.get("reason")),
  });
  back(formData, "/admin/permissions", code ? `error=${code}` : "ok=entitlement");
}

export async function setUserStatus(formData: FormData) {
  const id = uuid.safeParse(formData.get("user_id"));
  const action = String(formData.get("action") ?? "");
  if (!id.success) back(formData, "/admin/users", "error=NOT_FOUND");
  const { code } = await call("admin_set_user_status", { p_user_id: id.data, p_action: action, p_reason: reason(formData.get("reason")) });
  back(formData, `/admin/users/${id.data}`, code ? `error=${code}` : `ok=${action}`);
}

export async function setRole(formData: FormData) {
  const id = uuid.safeParse(formData.get("user_id"));
  if (!id.success) back(formData, "/admin/users", "error=NOT_FOUND");
  const { code } = await call("admin_set_role", {
    p_user_id: id.data, p_role: String(formData.get("role") ?? ""), p_grant: formData.get("grant") === "true", p_reason: reason(formData.get("reason")),
  });
  back(formData, `/admin/users/${id.data}`, code ? `error=${code}` : "ok=role");
}

// ---------------- アプリ固有ロール・公開段階 ----------------
export async function setAppRole(formData: FormData) {
  const id = uuid.safeParse(formData.get("user_id"));
  // 付与フォームは "APP03:reviewer" 形式の role_key、取消フォームは app_code + role_code
  const roleKey = String(formData.get("role_key") ?? "");
  if (roleKey.includes(":")) {
    const [a, r] = roleKey.split(":");
    formData.set("app_code", a);
    formData.set("role_code", r);
  }
  const app = String(formData.get("app_code") ?? "");
  if (!id.success || !/^[A-Z][A-Z0-9_]{1,31}$/.test(app)) back(formData, "/admin/users", "error=NOT_FOUND");
  const { code } = await call("admin_set_app_role", {
    p_user_id: id.data, p_app_code: app, p_role_code: String(formData.get("role_code") ?? ""),
    p_grant: formData.get("grant") === "true", p_scope_key: String(formData.get("scope_key") ?? "").slice(0, 120),
    p_reason: reason(formData.get("reason")),
  });
  back(formData, `/admin/users/${id.data}`, code ? `error=${code}` : "ok=app-role");
}

export async function setAppLifecycle(formData: FormData) {
  const app = String(formData.get("app_code") ?? "");
  if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(app)) back(formData, "/admin/settings", "error=NOT_FOUND");
  const { code } = await call("admin_set_app_lifecycle", {
    p_app_code: app, p_lifecycle: String(formData.get("lifecycle") ?? ""), p_reason: reason(formData.get("reason")) ?? "",
  });
  back(formData, "/admin/settings", code ? `error=${code}` : "ok=lifecycle");
}

// ---------------- 担当 ----------------
export async function setScope(formData: FormData) {
  const admin = uuid.safeParse(formData.get("admin_id"));
  const user = uuid.safeParse(formData.get("user_id"));
  if (!admin.success || !user.success) back(formData, "/admin/assignments", "error=NOT_FOUND");
  const { code } = await call("admin_set_scope", { p_admin_id: admin.data, p_user_id: user.data, p_assign: formData.get("assign") === "true" });
  back(formData, "/admin/assignments", code ? `error=${code}` : "ok=scope");
}

export async function setMentorAssignment(formData: FormData) {
  const mentor = uuid.safeParse(formData.get("mentor_id"));
  const user = uuid.safeParse(formData.get("user_id"));
  if (!mentor.success || !user.success) back(formData, "/admin/assignments", "error=NOT_FOUND");
  const { code } = await call("admin_set_mentor_assignment", {
    p_mentor_id: mentor.data, p_user_id: user.data, p_relation: String(formData.get("relation") ?? "mentor"), p_assign: formData.get("assign") === "true",
  });
  back(formData, "/admin/assignments", code ? `error=${code}` : "ok=assignment");
}

// ---------------- 削除手続き ----------------
export async function requestDeletion(formData: FormData) {
  const id = uuid.safeParse(formData.get("user_id"));
  if (!id.success) back(formData, "/admin/users", "error=NOT_FOUND");
  const { code } = await call("admin_request_deletion", { p_user_id: id.data, p_reason: reason(formData.get("reason")) ?? "" });
  back(formData, `/admin/users/${id.data}`, code ? `error=${code}` : "ok=deletion-requested");
}

export async function decideDeletion(formData: FormData) {
  const id = uuid.safeParse(formData.get("request_id"));
  if (!id.success) back(formData, "/admin/users", "error=NOT_FOUND");
  const { code } = await call("admin_decide_deletion", {
    p_request_id: id.data, p_decision: String(formData.get("decision") ?? ""), p_confirm_email: String(formData.get("confirm_email") ?? "") || null,
  });
  back(formData, "/admin/users", code ? `error=${code}` : "ok=deletion");
}

// ---------------- 設定 ----------------
export async function updateTtl(formData: FormData) {
  const n = z.coerce.number().int().min(1).max(168).safeParse(formData.get("ttl_hours"));
  if (!n.success) back(formData, "/admin/settings", "error=INVALID_TTL");
  const { code } = await call("admin_update_setting", { p_key: "invitation_ttl_hours", p_value: n.data });
  back(formData, "/admin/settings", code ? `error=${code}` : "ok=settings");
}
