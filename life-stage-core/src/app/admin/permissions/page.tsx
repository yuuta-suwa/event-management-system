import Link from "next/link";
import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash, PageHeader, RoleBadges, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { setEntitlement } from "../actions";

type UserRow = { id: string; email: string; display_name: string; status: string; apps: string[]; roles: string[] };

/** 利用者 × アプリの権限マトリクス（ワンクリックで付与・取消。すべて監査記録） */
export default async function PermissionsPage({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; error?: string }> }) {
  await requirePage({ kind: "admin" }, "/admin/permissions");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: apps }, { data }] = await Promise.all([
    supabase.from("apps").select("code, name_en").eq("is_active", true).order("sort_order"),
    supabase.rpc("admin_list_users", { p_search: sp.q ?? null, p_status: null, p_limit: 200, p_offset: 0 }),
  ]);
  const users = ((data ?? {}) as { users?: UserRow[] }).users ?? [];
  const backTo = `/admin/permissions${sp.q ? `?q=${encodeURIComponent(sp.q)}` : ""}`;

  return (
    <>
      <PageHeader en="PERMISSIONS" ja="権限管理" desc="アプリごとの利用許可を個別に設定します。APP01 の許可で APP02・APP03 が自動的に使えるようにはなりません。役割の変更は利用者詳細から行います（Super Admin のみ）。" />
      <Flash ok={sp.ok} error={sp.error} />
      <form className="row card" style={{ marginBottom: 16 }}>
        <div className="field"><label htmlFor="q">検索</label><input id="q" name="q" type="search" defaultValue={sp.q ?? ""} /></div>
        <div className="field" style={{ flex: "0 0 auto" }}><button className="btn" type="submit">検索</button></div>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>利用者</th><th>状態</th><th>役割</th>
              {(apps ?? []).map((a) => <th key={a.code} style={{ textAlign: "center" }}>{a.code}<div className="small muted" style={{ fontWeight: 400 }}>{a.name_en}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><Link href={`/admin/users/${u.id}`}><b>{u.display_name || "（未設定）"}</b></Link><div className="small muted">{u.email}</div></td>
                <td><StatusBadge status={u.status} /></td>
                <td><RoleBadges roles={u.roles} /></td>
                {(apps ?? []).map((a) => {
                  const on = u.apps.includes(a.code);
                  return (
                    <td key={a.code} style={{ textAlign: "center" }}>
                      <form action={setEntitlement}>
                        <input type="hidden" name="user_id" value={u.id} />
                        <input type="hidden" name="app_code" value={a.code} />
                        <input type="hidden" name="grant" value={on ? "false" : "true"} />
                        <input type="hidden" name="back" value={backTo} />
                        <SubmitButton className={`btn small ${on ? "" : "ghost"}`} confirm={on ? `${a.code} の権限を取り消します。よろしいですか？` : undefined}>
                          {on ? "✓ 許可中" : "許可する"}
                        </SubmitButton>
                      </form>
                    </td>
                  );
                })}
              </tr>
            ))}
            {!users.length ? <tr><td colSpan={3 + (apps ?? []).length} className="muted">担当範囲に利用者がいません。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
