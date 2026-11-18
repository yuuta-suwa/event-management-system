import { requirePage } from "@/lib/access";
import { isSuperAdmin } from "@/lib/access-policy";
import { createClient } from "@/lib/supabase/server";
import { Flash, PageHeader, SectionTitle, StatusBadge, formatDateTime } from "@/components/ui";
import { InviteForm, ReissueButton } from "@/components/invite-forms";
import { SubmitButton } from "@/components/submit-button";
import { revokeInvitation } from "../actions";
import { invitationView } from "@/lib/invitations";

export default async function InvitationsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; filter?: string }> }) {
  const access = await requirePage({ kind: "admin" }, "/admin/invitations");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: apps }, { data: invitations }] = await Promise.all([
    supabase.from("apps").select("code, name_en, name_ja").eq("is_active", true).order("sort_order"),
    supabase
      .from("invitations")
      .select("id, email, status, grant_admin_role, expires_at, created_at, accepted_at, revoked_at, revoke_reason, note, invitation_apps(app_code)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const rows = (invitations ?? []).map((i) => ({
    ...i,
    view: invitationView(i.status, i.expires_at),
    apps: ((i.invitation_apps as { app_code: string }[] | null) ?? []).map((a) => a.app_code),
  }));
  const filter = sp.filter ?? "open";
  const shown = rows.filter((r) => (filter === "all" ? true : filter === "open" ? ["pending", "expired"].includes(r.view) : r.view === filter));

  return (
    <>
      <PageHeader en="INVITATIONS" ja="招待管理" desc="招待は単回使用・ハッシュ保存・初期有効期限72時間。取り消し・再発行ができます。" />
      <Flash ok={sp.ok} error={sp.error} />
      <InviteForm apps={apps ?? []} canGrantRole={isSuperAdmin(access)} />

      <SectionTitle en="HISTORY" ja="招待履歴" />
      <div className="row" style={{ marginBottom: 10 }}>
        {[["open", "有効・期限切れ"], ["accepted", "受諾済"], ["revoked", "取消"], ["superseded", "再発行済"], ["all", "すべて"]].map(([k, label]) => (
          <a key={k} href={`?filter=${k}`} className={`btn small ${filter === k ? "" : "ghost"}`}>{label}</a>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>メールアドレス</th><th>アプリ</th><th>状態</th><th>有効期限</th><th>発行日時</th><th>操作</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{r.email}{r.grant_admin_role ? <div><span className="badge navy">{r.grant_admin_role}</span></div> : null}{r.note ? <div className="small muted">{r.note}</div> : null}</td>
                <td><span className="chips">{r.apps.map((a) => <span key={a} className="badge gold">{a}</span>)}</span></td>
                <td><StatusBadge status={r.view} />{r.revoke_reason ? <div className="small muted">{r.revoke_reason}</div> : null}</td>
                <td className="small">{formatDateTime(r.expires_at)}</td>
                <td className="small">{formatDateTime(r.created_at)}</td>
                <td className="actions">
                  {r.view === "pending" ? (
                    <form action={revokeInvitation} className="inline-form">
                      <input type="hidden" name="invitation_id" value={r.id} />
                      <input type="hidden" name="back" value="/admin/invitations" />
                      <SubmitButton className="btn small danger" confirm="この招待を取り消します。よろしいですか？">取消</SubmitButton>
                    </form>
                  ) : null}{" "}
                  {["pending", "expired", "revoked"].includes(r.view) ? <ReissueButton invitationId={r.id} /> : null}
                </td>
              </tr>
            ))}
            {!shown.length ? <tr><td colSpan={6} className="muted">該当する招待はありません。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
