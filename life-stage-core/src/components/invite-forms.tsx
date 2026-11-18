"use client";
import { useActionState, useState } from "react";
import { createInvitation, reissueInvitation, type InviteState } from "@/app/admin/actions";
import { messageFor } from "@/lib/errors";

function LinkResult({ state }: { state: InviteState }) {
  const [copied, setCopied] = useState(false);
  if (!state) return null;
  if (!state.ok) {
    const m = messageFor(state.code);
    return <div className="notice error" role="alert">{m.ja}<span className="en">{m.en}</span></div>;
  }
  return (
    <div className="notice ok" role="status">
      <b>{state.email}</b> への招待リンクを発行しました（有効期限：{state.expiresAt ? new Date(state.expiresAt).toLocaleString("ja-JP") : "—"}）。
      <span className="en">This link is shown only once. Send it to the invitee directly.</span>
      <div className="link-box" style={{ marginTop: 8 }}>
        <code>{state.link}</code>
        <button
          type="button"
          className="btn small"
          onClick={async () => {
            await navigator.clipboard.writeText(state.link ?? "");
            setCopied(true);
          }}
        >
          {copied ? "コピー済み" : "コピー"}
        </button>
      </div>
      <p className="small" style={{ margin: "8px 0 0" }}>
        このリンクはこの画面でのみ表示されます（DBにはハッシュのみ保存）。招待された本人だけに直接送付してください。
      </p>
    </div>
  );
}

export function InviteForm({ apps, canGrantRole }: { apps: { code: string; name_en: string; name_ja: string }[]; canGrantRole: boolean }) {
  const [state, action, pending] = useActionState(createInvitation, null);
  return (
    <form action={action} className="card">
      <LinkResult state={state} />
      <div className="row">
        <div className="field"><label htmlFor="email">招待するメールアドレス<small>Google アカウント</small></label><input id="email" name="email" type="email" required autoComplete="off" /></div>
        <div className="field" style={{ flex: "0 1 180px" }}><label htmlFor="ttl_hours">有効期限（時間）</label><input id="ttl_hours" name="ttl_hours" type="number" min={1} max={168} placeholder="72" /></div>
      </div>
      <div className="field">
        <label>利用を許可するアプリ<small>アプリごとに個別に選択</small></label>
        <div className="checks">
          {apps.map((a) => (
            <label key={a.code} className="check"><input type="checkbox" name="apps" value={a.code} /> {a.code}｜{a.name_en}</label>
          ))}
        </div>
      </div>
      {canGrantRole ? (
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="grant_role">管理ロール（任意・Super Admin のみ）</label>
          <select id="grant_role" name="grant_role" defaultValue="">
            <option value="">なし（一般利用者）</option><option value="mentor">Mentor</option><option value="admin">Admin</option><option value="super_admin">Super Admin</option>
          </select>
        </div>
      ) : null}
      <div className="field"><label htmlFor="note">メモ（任意）</label><input id="note" name="note" type="text" maxLength={500} /></div>
      <button className="btn gold" type="submit" disabled={pending}>{pending ? "発行中…" : "招待リンクを発行｜Create invitation"}</button>
    </form>
  );
}

export function ReissueButton({ invitationId }: { invitationId: string }) {
  const [state, action, pending] = useActionState(reissueInvitation, null);
  return (
    <form action={action} className="inline-form">
      <input type="hidden" name="invitation_id" value={invitationId} />
      <button className="btn small ghost" type="submit" disabled={pending}>{pending ? "…" : "再発行"}</button>
      {state ? <div style={{ marginTop: 8, whiteSpace: "normal" }}><LinkResult state={state} /></div> : null}
    </form>
  );
}
