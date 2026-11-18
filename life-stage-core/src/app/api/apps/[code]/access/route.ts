import { NextResponse } from "next/server";
import { requireApi } from "@/lib/access";
import { APP_CODE_PATTERN } from "@/lib/access-policy";

/** GET /api/apps/:code/access — アプリ別の利用可否（権限がなければ 403） */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!APP_CODE_PATTERN.test(code)) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  const g = await requireApi({ kind: "app", code });
  if ("response" in g) return g.response;
  return NextResponse.json({ app_code: code, granted: true });
}
