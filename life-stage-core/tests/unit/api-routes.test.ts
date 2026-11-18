/**
 * API ルートのサーバー側認可・CSRF 対策（Supabase はモック。DB 側の認可は tests/db で実DB検証）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Access } from "@/lib/access-policy";

const state: { access: Access; rpc: ReturnType<typeof vi.fn> } = {
  access: { authenticated: false, status: "anonymous", roles: [], apps: [] },
  rpc: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: state.access.authenticated ? { claims: { sub: state.access.user_id } } : null }) },
    rpc: (fn: string, args: unknown) => (fn === "my_access" ? Promise.resolve({ data: state.access, error: null }) : state.rpc(fn, args)),
  }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), forbidden: vi.fn() }));

const ORIGIN = "http://localhost:3000";
const active = (apps: Record<string, boolean>): Access => ({
  authenticated: true, user_id: "11111111-1111-4111-8111-111111111111", email: "a@example.com", status: "active",
  aal: "aal1", roles: [],
  apps: Object.entries(apps).map(([code, granted]) => ({ code, name_en: code, name_ja: code, granted })),
});
const body = { snapshot_id: "22222222-2222-4222-8222-222222222222", schema_version: "1.0", consent_version: "2026-11", confirmed: true };
const post = (url: string, init: { body?: unknown; headers?: Record<string, string> } = {}) =>
  new NextRequest(`${ORIGIN}${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...(init.headers ?? {}) },
    body: JSON.stringify(init.body ?? body),
  });

beforeEach(() => {
  state.rpc = vi.fn().mockResolvedValue({ data: { transfer_id: "t1", status: "succeeded", idempotent: false }, error: null });
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("POST /api/transfers/app01-to-app02", async () => {
  const { POST } = await import("@/app/api/transfers/app01-to-app02/route");

  it("未ログインは 401", async () => {
    state.access = { authenticated: false, status: "anonymous", roles: [], apps: [] };
    expect((await POST(post("/api/transfers/app01-to-app02"))).status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("未招待・停止中は 403", async () => {
    state.access = { ...active({ APP01: true }), status: "not_invited" };
    expect((await POST(post("/api/transfers/app01-to-app02"))).status).toBe(403);
    state.access = { ...active({ APP01: true }), status: "suspended" };
    const res = await POST(post("/api/transfers/app01-to-app02"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "ACCOUNT_NOT_ACTIVE" } });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("転送元アプリ（APP01）の権限がなければ 403", async () => {
    state.access = active({ APP01: false, APP02: true });
    expect((await POST(post("/api/transfers/app01-to-app02"))).status).toBe(403);
  });

  it("CSRF：JSON 以外・別オリジンは拒否", async () => {
    state.access = active({ APP01: true });
    expect((await POST(post("/api/transfers/app01-to-app02", { headers: { "content-type": "text/plain" } }))).status).toBe(415);
    expect((await POST(post("/api/transfers/app01-to-app02", { headers: { origin: "https://evil.example.com" } }))).status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("本人確認なし・不正入力は 400", async () => {
    state.access = active({ APP01: true });
    expect((await POST(post("/api/transfers/app01-to-app02", { body: { ...body, confirmed: false } }))).status).toBe(400);
    expect((await POST(post("/api/transfers/app01-to-app02", { body: { ...body, snapshot_id: "x" } }))).status).toBe(400);
  });

  it("正常時は user_id を送らず RPC を呼び 201。リクエストの user_id は無視", async () => {
    state.access = active({ APP01: true, APP02: true });
    const res = await POST(post("/api/transfers/app01-to-app02", { body: { ...body, user_id: "someone-else" } }));
    expect(res.status).toBe(201);
    expect(state.rpc).toHaveBeenCalledWith("request_transfer", {
      p_source_snapshot_id: body.snapshot_id, p_target_app: "APP02", p_schema_version: "1.0", p_consent_version: "2026-11",
    });
  });

  it("DB のエラーコードを HTTP に変換（内部情報は返さない）", async () => {
    state.access = active({ APP01: true });
    state.rpc.mockResolvedValueOnce({ data: null, error: { message: "SNAPSHOT_SUPERSEDED" } });
    const res = await POST(post("/api/transfers/app01-to-app02"));
    expect(res.status).toBe(409);
    state.rpc.mockResolvedValueOnce({ data: null, error: { message: "relation \"x\" does not exist" } });
    const res2 = await POST(post("/api/transfers/app01-to-app02"));
    expect(res2.status).toBe(500);
    expect(await res2.json()).toEqual({ error: { code: "UNKNOWN" } });
  });

  it("失敗した転送（再試行可能）は 202、冪等な再送は 200", async () => {
    state.access = active({ APP01: true });
    state.rpc.mockResolvedValueOnce({ data: { transfer_id: "t1", status: "failed", error: "TARGET_APP_ACCESS_DENIED", idempotent: false }, error: null });
    expect((await POST(post("/api/transfers/app01-to-app02"))).status).toBe(202);
    state.rpc.mockResolvedValueOnce({ data: { transfer_id: "t1", status: "succeeded", idempotent: true }, error: null });
    expect((await POST(post("/api/transfers/app01-to-app02"))).status).toBe(200);
  });
});

describe("GET /api/apps/:code/access（直URL・直API拒否 AT06）", async () => {
  const { GET } = await import("@/app/api/apps/[code]/access/route");
  const call = (code: string) => GET(new Request(`${ORIGIN}/api/apps/${code}/access`), { params: Promise.resolve({ code }) });

  it("権限のあるアプリのみ 200、ないアプリは 403、不正コードは 404", async () => {
    state.access = active({ APP01: true, APP02: false });
    expect((await call("APP01")).status).toBe(200);
    expect((await call("APP02")).status).toBe(403);
    expect((await call("../admin")).status).toBe(404);
  });
});
