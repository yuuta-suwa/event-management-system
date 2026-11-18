import Link from "next/link";
import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash, PageHeader, RoleBadges, SectionTitle, StatusBadge, formatDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { cancelDeletion, recordPrivacyConsent, requestDeletion, revokeShare, updateDisplayName } from "./actions";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const access = await requirePage({ kind: "active" }, "/account");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: consents }, { data: shares }, { data: deletions }] = await Promise.all([
    supabase.from("consent_records").select("id, consent_type, consent_version, granted_at, withdrawn_at").order("granted_at", { ascending: false }),
    supabase.from("data_shares").select("id, app_code, resource_type, permission, status, expires_at, created_at").eq("owner_id", access.user_id!).order("created_at", { ascending: false }),
    supabase.from("deletion_requests").select("id, status, requested_at").in("status", ["requested", "confirmed"]),
  ]);
  const privacyAgreed = (consents ?? []).some((c) => c.consent_type === "privacy" && !c.withdrawn_at);
  const openDeletion = (deletions ?? [])[0];

  return (
    <main className="narrow" style={{ maxWidth: 960 }}>
      <PageHeader en="MY ACCOUNT" ja="アカウント" desc="ご自身の利用状況・同意・共有・データを確認できます。" />
      <Flash ok={sp.ok} error={sp.error} />

      <SectionTitle en="APPS" ja="利用できるアプリ" />
      <div className="app-tiles">
        {access.apps.map((a) => (
          <div key={a.code} className={`app-tile ${a.granted ? "on" : "off"}`}>
            <div className="code">{a.code}</div>
            <h3>{a.name_en}</h3>
            <div className="muted small">{a.name_ja}</div>
            <div style={{ marginTop: 10 }}>
              {a.granted ? <Link className="btn small" href={`/apps/${a.code}`}>開く｜Open</Link> : <span className="badge plain">権限なし No access</span>}
            </div>
          </div>
        ))}
      </div>

      <SectionTitle en="PROFILE" ja="プロフィール" />
      <div className="card">
        <dl className="kv">
          <dt>メールアドレス</dt><dd>{access.email}</dd>
          <dt>状態</dt><dd><StatusBadge status={access.status} /></dd>
          <dt>役割</dt><dd><RoleBadges roles={access.roles} /></dd>
        </dl>
        <form action={updateDisplayName} className="row" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="display_name">表示名<small>Display name</small></label>
            <input id="display_name" name="display_name" type="text" maxLength={80} defaultValue={access.display_name ?? ""} />
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}><SubmitButton>保存</SubmitButton></div>
        </form>
      </div>

      <SectionTitle en="CONSENT" ja="同意" />
      <div className="card">
        {privacyAgreed ? (
          <p>プライバシーポリシー（2026-11版）に同意済みです。</p>
        ) : (
          <form action={recordPrivacyConsent}>
            <p>データの利用目的・保持期間・削除方法（暫定版 2026-11）を確認のうえ同意してください。</p>
            <SubmitButton className="btn gold">同意する｜Agree</SubmitButton>
          </form>
        )}
        {(consents ?? []).length ? (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>種類</th><th>版</th><th>同意日時</th><th>撤回</th></tr></thead>
              <tbody>
                {(consents ?? []).map((c) => (
                  <tr key={c.id}><td>{c.consent_type}</td><td>{c.consent_version}</td><td>{formatDateTime(c.granted_at)}</td><td>{c.withdrawn_at ? formatDateTime(c.withdrawn_at) : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <SectionTitle en="SHARING" ja="共有の管理" />
      <div className="card">
        <p className="small muted">
          共有はご本人の操作でのみ行われ、いつでもアプリ内の閲覧権限を撤回できます。ただし、相手がダウンロード済みの画像・PDFや外部へのコピーは回収できません。
        </p>
        {(shares ?? []).length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>アプリ</th><th>対象</th><th>権限</th><th>状態</th><th>期限</th><th></th></tr></thead>
              <tbody>
                {(shares ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>{s.app_code}</td><td>{s.resource_type}</td><td>{s.permission}</td>
                    <td>{s.status === "active" ? <span className="badge ok">共有中</span> : <span className="badge plain">撤回済</span>}</td>
                    <td>{formatDateTime(s.expires_at)}</td>
                    <td className="actions">
                      {s.status === "active" ? (
                        <form action={revokeShare}><input type="hidden" name="share_id" value={s.id} /><SubmitButton className="btn small danger">撤回</SubmitButton></form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">共有はありません。</p>}
      </div>

      <SectionTitle en="MY DATA" ja="データの出力・削除" />
      <div className="card">
        <p>ご自身のデータを JSON 形式でダウンロードできます。</p>
        <a className="btn ghost" href="/api/me/export">データを出力する｜Export</a>
        <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "18px 0" }} />
        {openDeletion ? (
          <form action={cancelDeletion}>
            <p>削除手続きを申請中です（{formatDateTime(openDeletion.requested_at)}）。管理者の確認後、アクセスが停止されます。</p>
            <SubmitButton className="btn ghost">申請を取り消す</SubmitButton>
          </form>
        ) : (
          <details>
            <summary>アカウント削除を申請する</summary>
            <form action={requestDeletion} style={{ marginTop: 12 }}>
              <p className="small">
                申請後、管理者の確認（二段階確認）を経て利用停止・削除手続きに入ります。保存義務のある記録（操作履歴等）とバックアップは、運用ポリシーで定める期間保持されたのち削除されます。
              </p>
              <div className="field"><label htmlFor="reason">理由（任意）</label><textarea id="reason" name="reason" rows={2} maxLength={1000} /></div>
              <label className="check"><input type="checkbox" name="confirm" /> 内容を理解しました</label>
              <div style={{ marginTop: 12 }}><SubmitButton className="btn danger" confirm="削除手続きを申請します。よろしいですか？">削除を申請する</SubmitButton></div>
            </form>
          </details>
        )}
      </div>
    </main>
  );
}
