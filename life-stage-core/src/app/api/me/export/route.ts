import { NextResponse } from "next/server";
import { requireApi } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";

/** GET /api/me/export — 本人データの出力（JSON ダウンロード） */
export async function GET() {
  const g = await requireApi({ kind: "active" });
  if ("response" in g) return g.response;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_export");
  if (error) return apiError(error);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="life-stage-export-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
