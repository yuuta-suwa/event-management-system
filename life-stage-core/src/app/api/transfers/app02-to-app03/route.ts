import type { NextRequest } from "next/server";
import { handleTransfer } from "@/lib/transfer-handler";

/** POST /api/transfers/app02-to-app03 — APP02 承認済み成長計画を APP03 へ（本人承認後） */
export function POST(req: NextRequest) {
  return handleTransfer(req, "app02-to-app03");
}
