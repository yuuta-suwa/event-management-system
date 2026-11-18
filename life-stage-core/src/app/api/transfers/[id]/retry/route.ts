import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApi } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { apiError, checkMutationRequest } from "@/lib/api";

/** POST /api/transfers/:id/retry — 失敗した転送を同じ転送IDで再試行（元データは変更しない） */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const bad = checkMutationRequest(req);
  if (bad) return bad;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  const g = await requireApi({ kind: "active" });
  if ("response" in g) return g.response;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("retry_transfer", { p_transfer_id: id });
  if (error) return apiError(error);
  const result = data as { status: string };
  return NextResponse.json(result, { status: result.status === "succeeded" ? 200 : 202 });
}
