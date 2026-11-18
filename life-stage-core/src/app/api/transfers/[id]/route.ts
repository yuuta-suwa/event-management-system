import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApi } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";

/** GET /api/transfers/:id — 転送状態（RLS により本人・担当管理者のみ） */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  const g = await requireApi({ kind: "active" });
  if ("response" in g) return g.response;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_transfers")
    .select("id, source_app, target_app, source_snapshot_id, schema_version, status, attempt_count, last_error, source_superseded_at, created_at, updated_at, completed_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return apiError(error);
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ ...data, needs_reconfirm: data.source_superseded_at !== null });
}
