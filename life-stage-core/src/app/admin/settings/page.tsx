import Link from "next/link";
import { requirePage } from "@/lib/access";
import { isSuperAdmin } from "@/lib/access-policy";
import { createClient } from "@/lib/supabase/server";
import { Flash, PageHeader, SectionTitle } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { setAppLifecycle, updateTtl } from "../actions";

const LIFECYCLE: Record<string, { label: string; tone: string }> = {
  planned: { label: "計画中 Planned", tone: "plain" },
  development: { label: "開発中 Development", tone: "plain" },
  trial: { label: "試験運用 Trial", tone: "gold" },
  active: { label: "公開中 Active", tone: "ok" },
  retired: { label: "終了 Retired", tone: "danger" },
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const access = await requirePage({ kind: "admin" }, "/admin/settings");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: settings }, { data: apps }] = await Promise.all([
    supabase.from("app_settings").select("key, value, updated_at"),
    supabase.from("apps").select("code, name_en, name_ja, is_active, lifecycle, data_classification, description").order("sort_order"),
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

      <SectionTitle en="APP REGISTRY" ja="アプリ登録マスター" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>コード</th><th>名称</th><th>公開段階</th><th>データ区分</th><th>利用者への表示</th>{superAdmin ? <th>公開段階の変更（Super Admin）</th> : null}</tr></thead>
          <tbody>
            {(apps ?? []).map((a) => (
              <tr key={a.code}>
                <td className="mono">{a.code}</td>
                <td><b>{a.name_en}</b><div className="small muted">{a.name_ja}</div></td>
                <td><span className={`badge ${LIFECYCLE[a.lifecycle]?.tone ?? "plain"}`}>{LIFECYCLE[a.lifecycle]?.label ?? a.lifecycle}</span></td>
                <td>{a.data_classification === "sensitive" ? <span className="badge warn">機微</span> : <span className="badge plain">標準</span>}</td>
                <td>{a.is_active ? <span className="badge ok">表示・付与可</span> : <span className="badge plain">非表示・付与不可</span>}</td>
                {superAdmin ? (
                  <td>
                    <form action={setAppLifecycle} className="row">
                      <input type="hidden" name="app_code" value={a.code} />
                      <input type="hidden" name="back" value="/admin/settings" />
                      <select name="lifecycle" defaultValue={a.lifecycle} aria-label={`${a.code} の公開段階`} style={{ maxWidth: 160 }}>
                        {Object.entries(LIFECYCLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <input name="reason" type="text" placeholder="理由（必須・承認番号など）" required maxLength={500} style={{ maxWidth: 220 }} />
                      <SubmitButton className="btn small" confirm={`${a.code} の公開段階を変更します。発注者の承認済みですか？`}>変更</SubmitButton>
                    </form>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        新しいアプリ（APP04 以降・LIFE ACCOUNTING 等）は「計画中」で登録し、発注者承認後に「試験運用」→「公開中」へ変更します。
        「試験運用」「公開中」のアプリだけが利用者に表示され、権限を付与できます。変更はすべて操作履歴に記録されます。
      </p>
    </>
  );
}
