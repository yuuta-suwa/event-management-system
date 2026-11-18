import Link from "next/link";
import { requirePage } from "@/lib/access";
import { isSuperAdmin } from "@/lib/access-policy";
import { createClient } from "@/lib/supabase/server";
import { Flash, PageHeader, SectionTitle } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { updateTtl } from "../actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const access = await requirePage({ kind: "admin" }, "/admin/settings");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: settings }, { data: apps }] = await Promise.all([
    supabase.from("app_settings").select("key, value, updated_at"),
    supabase.from("apps").select("code, name_en, name_ja, is_active, description").order("sort_order"),
  ]);
  const get = (k: string) => (settings ?? []).find((s) => s.key === k)?.value;
  const superAdmin = isSuperAdmin(access);

  return (
    <>
      <PageHeader en="SETTINGS" ja="設定" />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid two">
        <div className="card">
          <SectionTitle en="INVITATION" ja="招待" />
          <form action={updateTtl} className="row">
            <input type="hidden" name="back" value="/admin/settings" />
            <div className="field"><label htmlFor="ttl_hours">招待の有効期限（時間）<small>初期値 72 / 1〜168</small></label>
              <input id="ttl_hours" name="ttl_hours" type="number" min={1} max={168} defaultValue={Number(get("invitation_ttl_hours") ?? 72)} disabled={!superAdmin} />
            </div>
            {superAdmin ? <div className="field" style={{ flex: "0 0 auto" }}><SubmitButton>保存</SubmitButton></div> : null}
          </form>
          <p className="small muted">招待メールの自動送信は未導入です（送信サービスは発注者確認事項）。発行したリンクを管理者が本人へ直接送付します。</p>
        </div>

        <div className="card">
          <SectionTitle en="SECURITY" ja="セキュリティ" />
          <dl className="kv">
            <dt>管理者MFA</dt><dd>{get("require_admin_mfa") === true ? <span className="badge ok">必須（変更不可）</span> : <span className="badge danger">無効</span>}</dd>
            <dt>現在のセッション</dt><dd>{access.aal === "aal2" ? <span className="badge ok">MFA 検証済み</span> : <span className="badge warn">未検証</span>}</dd>
            <dt>停止時の遮断</dt><dd>DB 判定で即時（既存セッション含む）</dd>
          </dl>
          <p style={{ marginTop: 12 }}><Link href="/admin/mfa" className="btn small ghost">二段階認証の管理</Link></p>
        </div>
      </div>

      <SectionTitle en="APPS" ja="アプリ登録" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>コード</th><th>名称</th><th>説明</th><th>状態</th></tr></thead>
          <tbody>
            {(apps ?? []).map((a) => (
              <tr key={a.code}>
                <td className="mono">{a.code}</td><td><b>{a.name_en}</b><div className="small muted">{a.name_ja}</div></td>
                <td className="small">{a.description}</td>
                <td>{a.is_active ? <span className="badge ok">有効</span> : <span className="badge plain">無効（未承認）</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>アプリの追加・有効化はマイグレーションで行い、発注者承認後に適用します（docs/OPERATIONS.md）。</p>
    </>
  );
}
