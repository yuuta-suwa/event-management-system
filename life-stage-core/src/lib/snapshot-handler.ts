import "server-only";
import { NextResponse } from "next/server";
import { requireApi } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";

/** GET /api/blueprints/current | /api/growth-plans/current の共通処理（本人の最新確定版のみ） */
export async function currentSnapshot(appCode: "APP01" | "APP02", snapshotType: "life_blueprint" | "growth_plan") {
  const g = await requireApi({ kind: "app", code: appCode });
  if ("response" in g) return g.response;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_snapshots")
    .select("id, app_code, snapshot_type, schema_version, version, payload, confirmed_at")
    .eq("user_id", g.access.user_id!)
    .eq("app_code", appCode)
    .eq("snapshot_type", snapshotType)
    .is("superseded_at", null)
    .maybeSingle();
  if (error) return apiError(error);
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ snapshot_id: data.id, ...data });
}
