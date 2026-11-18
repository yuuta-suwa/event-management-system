import Link from "next/link";
import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, SectionTitle, formatDateTime } from "@/components/ui";

type Stats = {
  users_active: number; users_suspended: number; users_revoked: number; users_deletion_pending: number;
  invitations_pending: number; invitations_expired: number; entitlements_by_app: Record<string, number>;
  transfers_succeeded: number; transfers_failed: number; audit_failures_24h: number;
};

export default async function Dashboard() {
  await requirePage({ kind: "admin" }, "/admin");
  const supabase = await createClient();
  const [{ data: stats }, { data: logs }, { data: apps }] = await Promise.all([
    supabase.rpc("admin_dashboard_stats"),
    supabase.from("audit_logs").select("id, occurred_at, action, target_type, success").order("occurred_at", { ascending: false }).limit(8),
    supabase.from("apps").select("code, name_en, name_ja, is_active").order("sort_order"),
  ]);
  const s = (stats ?? {}) as Stats;

  return (
    <>
      <PageHeader en="DASHBOARD" ja="全体状況" desc="担当範囲の利用状況です。個人の人生設計などの本文は表示しません。" />
      <div className="grid kpi">
        <Kpi en="ACTIVE" ja="利用中" value={s.users_active} gold />
        <Kpi en="SUSPENDED" ja="停止中" value={s.users_suspended} />
        <Kpi en="INVITED" ja="招待中（有効）" value={s.invitations_pending} />
        <Kpi en="EXPIRED" ja="期限切れ招待" value={s.invitations_expired} />
        <Kpi en="TRANSFER OK" ja="転送成功" value={s.transfers_succeeded} />
        <Kpi en="TRANSFER NG" ja="転送失敗" value={s.transfers_failed} alert={s.transfers_failed > 0} />
        <Kpi en="ERRORS 24H" ja="失敗操作（24時間）" value={s.audit_failures_24h} alert={s.audit_failures_24h > 0} />
        <Kpi en="DELETION" ja="削除手続中" value={s.users_deletion_pending} />
      </div>

      <SectionTitle en="APP ENTITLEMENTS" ja="アプリ別権限数" />
      <div className="grid kpi">
        {(apps ?? []).filter((a) => a.is_active).map((a) => (
          <Kpi key={a.code} en={a.code} ja={`${a.name_en}｜${a.name_ja}`} value={s.entitlements_by_app?.[a.code] ?? 0} gold />
        ))}
      </div>

      <SectionTitle en="RECENT ACTIVITY" ja="最近の操作" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>日時</th><th>操作</th><th>対象</th><th>結果</th></tr></thead>
          <tbody>
            {(logs ?? []).map((l) => (
              <tr key={l.id}>
                <td>{formatDateTime(l.occurred_at)}</td><td className="mono">{l.action}</td><td>{l.target_type ?? "—"}</td>
                <td>{l.success ? <span className="badge ok">成功</span> : <span className="badge danger">失敗</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 10 }}><Link href="/admin/audit">操作履歴をすべて見る →</Link></p>
    </>
  );
}

function Kpi({ en, ja, value, gold, alert }: { en: string; ja: string; value: number | undefined; gold?: boolean; alert?: boolean }) {
  return (
    <div className={`card kpi-card${gold ? " gold" : ""}${alert ? " alert" : ""}`}>
      <div className="label"><b>{en}</b>{ja}</div>
      <div className="value">{value ?? 0}</div>
    </div>
  );
}
