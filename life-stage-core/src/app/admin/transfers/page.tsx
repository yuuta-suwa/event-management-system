import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge, formatDateTime } from "@/components/ui";

/** 連携転送の状態（転送内容＝個人データは表示しない。状態・エラーのみ） */
export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePage({ kind: "admin" }, "/admin/transfers");
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("data_transfers")
    .select("id, user_id, source_app, target_app, schema_version, status, attempt_count, last_error, source_superseded_at, created_at, completed_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.status === "failed" || sp.status === "succeeded") q = q.eq("status", sp.status);
  const { data: rows } = await q;
  const ids = [...new Set((rows ?? []).map((r) => r.user_id))];
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, email").in("id", ids) : { data: [] };
  const email = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  return (
    <>
      <PageHeader en="TRANSFERS" ja="連携状況" desc="APP01→APP02、APP02→APP03 の引き継ぎ状況です。内容（個人データ）は表示しません。失敗した転送は本人が再試行できます。" />
      <div className="row" style={{ marginBottom: 10 }}>
        {[["", "すべて"], ["failed", "失敗"], ["succeeded", "成功"]].map(([k, l]) => (
          <a key={k} className={`btn small ${(sp.status ?? "") === k ? "" : "ghost"}`} href={k ? `?status=${k}` : "?"}>{l}</a>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>利用者</th><th>経路</th><th>版</th><th>状態</th><th>試行</th><th>エラー</th><th>要再確認</th><th>作成</th></tr></thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td className="small">{email.get(r.user_id) ?? r.user_id.slice(0, 8)}</td>
                <td>{r.source_app} → {r.target_app}</td>
                <td>{r.schema_version}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.attempt_count}</td>
                <td className="mono small">{r.last_error ?? "—"}</td>
                <td>{r.source_superseded_at ? <span className="badge warn">元データ更新</span> : "—"}</td>
                <td className="small">{formatDateTime(r.created_at)}</td>
              </tr>
            ))}
            {!(rows ?? []).length ? <tr><td colSpan={8} className="muted">転送はまだありません。</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        ※ APP01〜03 本体は未接続のため、現時点の転送は連携契約の検証（モック）です。本番接続済みではありません。
      </p>
    </>
  );
}
