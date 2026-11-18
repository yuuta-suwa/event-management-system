import Link from "next/link";
import { requirePage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Flash, PageHeader, RoleBadges, StatusBadge, formatDateTime } from "@/components/ui";

type UserRow = { id: string; email: string; display_name: string; status: string; created_at: string; apps: string[]; roles: string[] };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; ok?: string; error?: string }> }) {
  await requirePage({ kind: "admin" }, "/admin/users");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = ["active", "suspended", "revoked", "deletion_pending"].includes(sp.status ?? "") ? sp.status! : null;
  const supabase = await createClient();
  const [{ data }, { data: deletions }] = await Promise.all([
    supabase.rpc("admin_list_users", { p_search: sp.q ?? null, p_status: status, p_limit: 50, p_offset: (page - 1) * 50 }),
    supabase.from("deletion_requests").select("id, user_id, status, source, reason, requested_at").in("status", ["requested", "confirmed"]),
  ]);
  const { total = 0, users = [] } = (data ?? {}) as { total?: number; users?: UserRow[] };

  return (
    <>
      <PageHeader en="USERS" ja="利用者管理" desc="利用者の検索・状態確認。詳細画面で権限変更・停止・再開・削除手続きを行います。">
        <Link href="/admin/invitations" className="btn gold">＋ 新規招待</Link>
      </PageHeader>
      <Flash ok={sp.ok} error={sp.error} />
      <form className="row card" style={{ marginBottom: 16 }}>
        <div className="field"><label htmlFor="q">検索<small>メール・表示名</small></label><input id="q" name="q" type="search" defaultValue={sp.q ?? ""} /></div>
        <div className="field" style={{ flex: "0 1 220px" }}>
          <label htmlFor="status">状態</label>
          <select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">すべて</option><option value="active">利用中</option><option value="suspended">停止中</option>
            <option value="revoked">利用権剥奪</option><option value="deletion_pending">削除手続中</option>
          </select>
        </div>
        <div className="field" style={{ flex: "0 0 auto" }}><button className="btn" type="submit">検索</button></div>
      </form>

      {(deletions ?? []).length ? (
        <div className="notice warn">削除手続きの申請が {deletions!.length} 件あります。各利用者の詳細画面で確認してください。<span className="en">Pending deletion requests.</span></div>
      ) : null}

      <p className="muted small">{total} 名</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>利用者</th><th>状態</th><th>アプリ権限</th><th>役割</th><th>登録日</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.display_name || "（未設定）"}</b><div className="muted small">{u.email}</div></td>
                <td><StatusBadge status={u.status} /></td>
                <td><span className="chips">{u.apps.length ? u.apps.map((a) => <span key={a} className="badge gold">{a}</span>) : <span className="muted small">なし</span>}</span></td>
                <td><RoleBadges roles={u.roles} /></td>
                <td className="small">{formatDateTime(u.created_at)}</td>
                <td className="actions"><Link className="btn small ghost" href={`/admin/users/${u.id}`}>詳細</Link></td>
              </tr>
            ))}
            {!users.length ? <tr><td colSpan={6} className="muted">該当する利用者はいません。</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        {page > 1 ? <Link className="btn small ghost" href={`?q=${encodeURIComponent(sp.q ?? "")}&status=${status ?? ""}&page=${page - 1}`}>← 前へ</Link> : null}
        {page * 50 < total ? <Link className="btn small ghost" href={`?q=${encodeURIComponent(sp.q ?? "")}&status=${status ?? ""}&page=${page + 1}`}>次へ →</Link> : null}
      </div>
    </>
  );
}
