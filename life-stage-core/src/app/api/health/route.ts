import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, service: "life-stage-common-core" });
}
