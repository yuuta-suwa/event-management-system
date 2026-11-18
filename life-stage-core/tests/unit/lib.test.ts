import { describe, it, expect } from "vitest";
import { isProtectedPath, safeNextPath } from "@/lib/paths";
import { errorCode, messageFor } from "@/lib/errors";
import { invitationView } from "@/lib/invitations";
import { statusForCode } from "@/lib/api";
import { publicEnv } from "@/lib/env";

describe("safeNextPath（オープンリダイレクト防止）", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/users?q=a", "/admin/users?q=a"],
    ["https://evil.example.com", "/"],
    ["//evil.example.com", "/"],
    ["/\\evil.example.com", "/"],
    ["javascript:alert(1)", "/"],
    ["", "/"],
    [null, "/"],
    ["/ok\nSet-Cookie:x", "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input as string | null)).toBe(expected);
  });
});

describe("isProtectedPath", () => {
  it("保護対象と公開パス", () => {
    expect(isProtectedPath("/admin")).toBe(true);
    expect(isProtectedPath("/admin/users/1")).toBe(true);
    expect(isProtectedPath("/apps/APP01")).toBe(true);
    expect(isProtectedPath("/api/me/access")).toBe(true);
    expect(isProtectedPath("/api/health")).toBe(false);
    expect(isProtectedPath("/administrator")).toBe(false);
    expect(isProtectedPath("/invite")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
  });
});

describe("errorCode / messageFor", () => {
  it("DB の業務エラーコードを抽出し、未知のエラーは内部情報を出さず UNKNOWN", () => {
    expect(errorCode({ message: "FORBIDDEN" })).toBe("FORBIDDEN");
    expect(errorCode({ message: "MFA_REQUIRED" })).toBe("MFA_REQUIRED");
    expect(errorCode({ message: "permission denied for table profiles" })).toBe("FORBIDDEN");
    expect(errorCode({ message: 'duplicate key value violates unique constraint "x"' })).toBe("UNKNOWN");
    expect(errorCode(null)).toBe("UNKNOWN");
    expect(messageFor("INVITATION_EXPIRED").ja).toContain("有効期限");
    expect(messageFor("NOPE")).toEqual(messageFor("UNKNOWN"));
  });
});

describe("invitationView", () => {
  it("期限切れ pending は expired", () => {
    const now = new Date("2026-11-18T00:00:00Z");
    expect(invitationView("pending", "2026-11-17T23:59:59Z", now)).toBe("expired");
    expect(invitationView("pending", "2026-11-18T00:00:01Z", now)).toBe("pending");
    expect(invitationView("accepted", "2026-01-01T00:00:00Z", now)).toBe("accepted");
  });
});

describe("statusForCode", () => {
  it("業務エラー→HTTP", () => {
    expect(statusForCode("NOT_AUTHENTICATED")).toBe(401);
    expect(statusForCode("FORBIDDEN")).toBe(403);
    expect(statusForCode("APP_ACCESS_DENIED")).toBe(403);
    expect(statusForCode("NOT_FOUND")).toBe(404);
    expect(statusForCode("SNAPSHOT_SUPERSEDED")).toBe(409);
    expect(statusForCode("INVALID_ROUTE")).toBe(400);
    expect(statusForCode("UNKNOWN")).toBe(500);
  });
});

describe("publicEnv（秘密鍵のブラウザ公開防止）", () => {
  it("secret / service_role キーを公開用に設定すると起動を拒否", () => {
    const prev = { ...process.env };
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_secret_abc";
    expect(() => publicEnv()).toThrow(/secret/);
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_abc";
    expect(publicEnv().key).toBe("sb_publishable_abc");
    process.env = prev;
  });
});
