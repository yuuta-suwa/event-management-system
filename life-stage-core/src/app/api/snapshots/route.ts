import { NextResponse, type NextRequest } from "next/server";
import { requireApi } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { apiError, badRequest, checkMutationRequest, readJson } from "@/lib/api";
import { SnapshotRequest } from "@/lib/transfer-contract";

/**
 * POST /api/snapshots — 確定スナップショットの登録（連携契約の検証用）。
 * APP01/APP02 本体が未実装の間、試験運用でモックデータを登録するために使う。
 * 各APP本体の実装後は、そのAPPの確定処理から同じRPCを呼ぶ。
 */
export async function POST(req: NextRequest) {
  const bad = checkMutationRequest(req);
  if (bad) return bad;
  const parsed = SnapshotRequest.safeParse(await readJson(req));
  if (!parsed.success) return badRequest("INVALID_REQUEST", parsed.error.issues.map((i) => i.path.join(".")));
  const g = await requireApi({ kind: "app", code: parsed.data.app_code });
  if ("response" in g) return g.response;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_snapshot", {
    p_app_code: parsed.data.app_code,
    p_snapshot_type: parsed.data.snapshot_type,
    p_schema_version: parsed.data.schema_version,
    p_payload: parsed.data.payload,
  });
  if (error) return apiError(error);
  return NextResponse.json(data, { status: 201 });
}
