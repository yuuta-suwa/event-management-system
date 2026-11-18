import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, formatDateTime } from "@/components/ui";

const ACTION_GROUPS: [string, string][] = [
  ["", "すべて"], ["invitation.", "招待"], ["entitlement.", "権限"], ["user.", "状態"], ["role.", "役割"],
  ["scope.", "担当範囲"], ["mentor.", "伴走担当"], ["share.", "共有"], ["transfer.", "転送"], ["deletion.", "削除"], ["setting.", "設定"], ["data.", "出力"],
];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ group?: string; failed?: string; page?: string }> }) {
  await requirePage({ kind: "admin" }, "/admin/audit");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const group = ACTION_GROUPS.some(([k]) => k === sp.group) ? sp.group ?? "" : "";
  const supabase = await createClient();
  let q = supabase
    .from("audit_logs")
    .select("id, occurred_at, actor_id, actor_aal, action, target_type, target_id, target_user_id, app_code, before_state, after_state, reason, success", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .range((page - 1) * 100, page * 100 - 1);
  if (group) q = q.like("action", `${group}%`);
  if (sp.failed === "1") q = q.eq("success", false);
  const { data: logs, count } = await q;

  const ids = [...new Set((logs ?? []).flatMap((l) => [l.actor_id, l.target_user_id]).filter(Boolean) as string[])];
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, email").in("id", ids) : { data: [] };
  const email = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  const who = (id: string | null) => (id ? email.get(id) ?? id.slice(0, 8) + "…" : "system");
  const qs = (o: Record<string, string>) => "?" + new URLSearchParams({ group, failed: sp.failed ?? "", ...o }).toString();

  return (
    <>
      <PageHeader en="AUDIT LOGS" ja="操作履歴" desc="招待・権限変更・停止・再開・削除要求・共有・転送などの記録です。記録は追記専用で、変更・削除できません。" />
      <div className="row" style={{ marginBottom: 10 }}>
        {ACTION_GROUPS.map(([k, l]) => <a key={k} className={`btn small ${group === k ? "" : "ghost"}`} href={qs({ group: k, page: "1" })}>{l}</a>)}
        <a className={`btn small ${sp.failed === "1" ? "danger" : "ghost"}`} href={qs({ failed: sp.failed === "1" ? "" : "1", page: "1" })}>失敗のみ</a>
      </div>
      <p className="muted small">{count ?? 0} 件</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>日時</th><th>実行者</th><th>操作</th><th>対象者</th><th>変更</th><th>理由</th><th>結果</th></tr></thead>
          <tbody>
            {(logs ?? []).map((l) => (
              <tr key={l.id}>
                <td className="small">{formatDateTime(l.occurred_at)}</td>
                <td className="small">{who(l.actor_id)}{l.actor_aal === "aal2" ? <div><span className="badge plain">MFA</span></div> : null}</td>
                <td className="mono">{l.action}{l.app_code ? <div className="small muted">{l.app_code}</div> : null}</td>
                <td className="small">{l.target_user_id ? who(l.target_user_id) : l.target_type ?? "—"}</td>
                <td className="mono small" style={{ maxWidth: 320 }}>
                  {l.before_state ? <div>before: {JSON.stringify(l.before_state)}</div> : null}
                  {l.after_state ? <div>after: {JSON.stringify(l.after_state)}</div> : null}
                </td>
                <td className="small">{l.reason ?? "—"}</td>
                <td>{l.success ? <span className="badge ok">成功</span> : <span className="badge danger">失敗</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        {page > 1 ? <a className="btn small ghost" href={qs({ page: String(page - 1) })}>← 新しい</a> : null}
        {page * 100 < (count ?? 0) ? <a className="btn small ghost" href={qs({ page: String(page + 1) })}>古い →</a> : null}
      </div>
    </>
  );
}
