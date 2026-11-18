import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { requireApi } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { apiError, badRequest, checkMutationRequest, readJson } from "@/lib/api";
import { TRANSFER_ROUTES, TransferRequest } from "@/lib/transfer-contract";

/**
 * POST /api/transfers/app01-to-app02 | app02-to-app03 の共通処理。
 * user_id はリクエストから受け取らず、セッション（DB 側は auth.uid()）から導出する。
 */
export async function handleTransfer(req: NextRequest, route: keyof typeof TRANSFER_ROUTES) {
  const bad = checkMutationRequest(req);
  if (bad) return bad;
  const r = TRANSFER_ROUTES[route];
  const g = await requireApi({ kind: "app", code: r.source });
  if ("response" in g) return g.response;

  const parsed = TransferRequest.safeParse(await readJson(req));
  if (!parsed.success) return badRequest("INVALID_REQUEST", parsed.error.issues.map((i) => i.path.join(".")));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_transfer", {
    p_source_snapshot_id: parsed.data.snapshot_id,
    p_target_app: r.target,
    p_schema_version: parsed.data.schema_version,
    p_consent_version: parsed.data.consent_version,
  });
  if (error) return apiError(error);
  const result = data as { transfer_id: string; status: string; error?: string; idempotent: boolean };
  // 失敗も「記録済み・再試行可能」として 202 を返す
  return NextResponse.json(result, { status: result.status === "succeeded" ? (result.idempotent ? 200 : 201) : 202 });
}
