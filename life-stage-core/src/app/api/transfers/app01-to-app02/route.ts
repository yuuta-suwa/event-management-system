import type { NextRequest } from "next/server";
import { handleTransfer } from "@/lib/transfer-handler";

/** POST /api/transfers/app01-to-app02 — APP01 確定スナップショットを APP02 へ（本人承認後） */
export function POST(req: NextRequest) {
  return handleTransfer(req, "app01-to-app02");
}
