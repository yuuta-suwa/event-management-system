import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { errorCode } from "@/lib/errors";

/** 業務エラーコード → HTTP ステータス */
export function statusForCode(code: string): number {
  if (code === "NOT_AUTHENTICATED") return 401;
  if (["FORBIDDEN", "MFA_REQUIRED", "ACCOUNT_NOT_ACTIVE", "APP_ACCESS_DENIED"].includes(code)) return 403;
  if (code === "NOT_FOUND") return 404;
  if (["SNAPSHOT_SUPERSEDED", "PENDING_INVITATION_EXISTS", "ALREADY_MEMBER", "DELETION_ALREADY_REQUESTED"].includes(code)) return 409;
  if (code === "TOO_MANY_ATTEMPTS") return 429;
  if (code === "UNKNOWN") return 500;
  return 400;
}

export function apiError(err: unknown) {
  const code = errorCode(err);
  return NextResponse.json({ error: { code } }, { status: statusForCode(code) });
}

/**
 * Cookie 認証の状態変更 API に対する CSRF 対策：
 *  - Content-Type: application/json を必須（クロスサイトの単純リクエストでは送れない）
 *  - Origin ヘッダーが自サイトと一致すること
 */
export function checkMutationRequest(req: NextRequest): NextResponse | null {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: { code: "UNSUPPORTED_MEDIA_TYPE" } }, { status: 415 });
  }
  const origin = req.headers.get("origin");
  const expected = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin : req.nextUrl.origin;
  if (!origin || origin !== expected) {
    return NextResponse.json({ error: { code: "INVALID_ORIGIN" } }, { status: 403 });
  }
  return null;
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function badRequest(code = "INVALID_REQUEST", details?: unknown) {
  return NextResponse.json({ error: { code, details } }, { status: 400 });
}
