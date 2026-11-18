"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Factor = { id: string; status: string; friendly_name?: string | null };
type Enroll = { factorId: string; qr: string; secret: string };

/**
 * 管理者の二段階認証（Supabase Auth MFA / TOTP）。
 * 検証に成功するとセッションが aal2 になり、DB 側の管理RPC が実行可能になる。
 */
export function MfaPanel({ next }: { next: string }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<string | null>(null);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [{ data: aal }, { data: list }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    setLevel(aal?.currentLevel ?? null);
    setFactors(((list?.totp ?? []) as Factor[]).filter((f) => f.status === "verified"));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // 初回表示時に Supabase Auth から MFA 状態を読み込む（外部システムとの同期）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function startEnroll() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `LIFE STAGE Admin ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error || !data) return setError("登録を開始できませんでした。時間をおいて再試行してください。");
    setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify(factorId: string) {
    if (!/^\d{6}$/.test(code)) return setError("6桁のコードを入力してください。");
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) return setError("コードが正しくないか、有効期限が切れています。");
    setCode("");
    router.replace(next);
    router.refresh();
  }

  if (loading) return <p className="muted">読み込み中…</p>;

  if (level === "aal2") {
    return (
      <div className="notice ok">
        このセッションは二段階認証済みです。<span className="en">MFA verified for this session.</span>
        <div style={{ marginTop: 10 }}><a className="btn small" href={next}>管理画面へ</a></div>
      </div>
    );
  }

  const codeInput = (
    <div className="field" style={{ maxWidth: 240 }}>
      <label htmlFor="code">認証アプリの6桁コード</label>
      <input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
    </div>
  );

  return (
    <div className="card">
      {error ? <div className="notice error" role="alert">{error}</div> : null}
      {factors.length ? (
        <>
          <p>認証アプリ（Google Authenticator 等）に表示されている6桁のコードを入力してください。</p>
          {codeInput}
          <button className="btn" disabled={busy} onClick={() => verify(factors[0].id)}>確認する｜Verify</button>
        </>
      ) : enroll ? (
        <>
          <p>認証アプリで QR コードを読み取り、表示された6桁のコードを入力してください。</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="MFA 登録用 QR コード" width={180} height={180} style={{ background: "#fff", padding: 8, border: "1px solid var(--line)", borderRadius: 8 }} />
          <p className="small muted">読み取れない場合は次のキーを手入力：<code>{enroll.secret}</code></p>
          {codeInput}
          <button className="btn" disabled={busy} onClick={() => verify(enroll.factorId)}>登録を完了する</button>
        </>
      ) : (
        <>
          <p>管理操作には二段階認証（TOTP）が必要です。認証アプリを登録してください。</p>
          <button className="btn gold" disabled={busy} onClick={startEnroll}>認証アプリを登録する</button>
        </>
      )}
    </div>
  );
}
