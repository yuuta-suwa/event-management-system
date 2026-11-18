import { describe, it, expect } from "vitest";
import { decide, denialStatus, type Access } from "@/lib/access-policy";

const base: Access = {
  authenticated: true,
  user_id: "u1",
  email: "a@example.com",
  status: "active",
  aal: "aal1",
  admin_mfa_required: true,
  roles: [],
  apps: [
    { code: "APP01", name_en: "THE FINAL DISCOVERY", name_ja: "人生設計", granted: true },
    { code: "APP02", name_en: "SELF-REALIZATION ENGINE", name_ja: "成長戦略", granted: false },
    { code: "APP03", name_en: "MAKE IT REAL", name_ja: "実行・実績・認定", granted: false },
  ],
};

describe("decide()", () => {
  it("未ログインは login", () => {
    expect(decide(null, { kind: "active" })).toEqual({ ok: false, reason: "login" });
    expect(decide({ ...base, authenticated: false, status: "anonymous" }, { kind: "app", code: "APP01" })).toEqual({ ok: false, reason: "login" });
  });

  it("Google認証済みでも未招待は not_invited（AT01）", () => {
    const a: Access = { ...base, status: "not_invited", apps: base.apps.map((x) => ({ ...x, granted: false })) };
    expect(decide(a, { kind: "active" })).toEqual({ ok: false, reason: "not_invited" });
    expect(decide(a, { kind: "authenticated" })).toEqual({ ok: true });
  });

  it("停止・剥奪・削除手続中は inactive（AT08）", () => {
    for (const status of ["suspended", "revoked", "deletion_pending", "deleted"] as const) {
      expect(decide({ ...base, status }, { kind: "app", code: "APP01" })).toEqual({ ok: false, reason: "inactive" });
    }
  });

  it("アプリ別権限：APP01 許可は APP02 を含意しない（AT05）", () => {
    expect(decide(base, { kind: "app", code: "APP01" })).toEqual({ ok: true });
    expect(decide(base, { kind: "app", code: "APP02" })).toEqual({ ok: false, reason: "forbidden" });
    expect(decide(base, { kind: "app", code: "UNKNOWN" })).toEqual({ ok: false, reason: "forbidden" });
  });

  it("管理画面：一般利用者・メンターは forbidden", () => {
    expect(decide(base, { kind: "admin" })).toEqual({ ok: false, reason: "forbidden" });
    expect(decide({ ...base, roles: ["mentor"] }, { kind: "admin" })).toEqual({ ok: false, reason: "forbidden" });
  });

  it("管理画面：MFA未検証は mfa、aal2 で許可", () => {
    const admin: Access = { ...base, roles: ["admin"] };
    expect(decide(admin, { kind: "admin" })).toEqual({ ok: false, reason: "mfa" });
    expect(decide(admin, { kind: "admin", skipMfa: true })).toEqual({ ok: true });
    expect(decide({ ...admin, aal: "aal2" }, { kind: "admin" })).toEqual({ ok: true });
  });

  it("Super Admin 限定操作は Admin では forbidden", () => {
    expect(decide({ ...base, roles: ["admin"], aal: "aal2" }, { kind: "admin", superOnly: true })).toEqual({ ok: false, reason: "forbidden" });
    expect(decide({ ...base, roles: ["super_admin"], aal: "aal2" }, { kind: "admin", superOnly: true })).toEqual({ ok: true });
  });

  it("停止中の管理者は管理画面に入れない", () => {
    expect(decide({ ...base, roles: ["super_admin"], aal: "aal2", status: "suspended" }, { kind: "admin" })).toEqual({ ok: false, reason: "inactive" });
  });

  it("HTTP ステータス", () => {
    expect(denialStatus("login")).toBe(401);
    expect(denialStatus("forbidden")).toBe(403);
    expect(denialStatus("mfa")).toBe(403);
    expect(denialStatus("inactive")).toBe(403);
  });
});
