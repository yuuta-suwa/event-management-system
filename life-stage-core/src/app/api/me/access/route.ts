import { NextResponse } from "next/server";
import { requireApi } from "@/lib/access";

/** GET /api/me/access — 現在のアクセス状態（各APPがログイン後に参照する） */
export async function GET() {
  const g = await requireApi({ kind: "authenticated" });
  if ("response" in g) return g.response;
  return NextResponse.json(g.access);
}
