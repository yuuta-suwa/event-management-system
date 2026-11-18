"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorCode } from "@/lib/errors";
import { requirePage } from "@/lib/access";

function back(q: string): never {
  redirect(`/account?${q}`);
}

export async function updateDisplayName(formData: FormData) {
  const access = await requirePage({ kind: "active" }, "/account");
  const parsed = z.string().trim().max(80).safeParse(formData.get("display_name"));
  if (!parsed.success) back("error=INVALID_ACTION");
  const supabase = await createClient();
  // RLS：本人の行・表示名列のみ更新可能
  const { error } = await supabase.from("profiles").update({ display_name: parsed.data }).eq("id", access.user_id!);
  revalidatePath("/account");
  back(error ? `error=${errorCode(error)}` : "ok=profile");
}

export async function recordPrivacyConsent() {
  await requirePage({ kind: "active" }, "/account");
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_consent", { p_consent_type: "privacy", p_consent_version: "2026-11", p_app_code: null });
  back(error ? `error=${errorCode(error)}` : "ok=consent");
}

export async function revokeShare(formData: FormData) {
  await requirePage({ kind: "active" }, "/account");
  const id = z.uuid().safeParse(formData.get("share_id"));
  if (!id.success) back("error=NOT_FOUND");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_share", { p_share_id: id.data });
  back(error ? `error=${errorCode(error)}` : "ok=share");
}

export async function requestDeletion(formData: FormData) {
  await requirePage({ kind: "active" }, "/account");
  if (formData.get("confirm") !== "on") back("error=CONFIRMATION_MISMATCH");
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_own_deletion", { p_reason: String(formData.get("reason") ?? "").slice(0, 1000) || null });
  back(error ? `error=${errorCode(error)}` : "ok=deletion");
}

export async function cancelDeletion() {
  await requirePage({ kind: "active" }, "/account");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_own_deletion");
  back(error ? `error=${errorCode(error)}` : "ok=deletion-cancel");
}
