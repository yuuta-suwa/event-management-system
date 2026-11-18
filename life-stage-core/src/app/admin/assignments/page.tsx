import { requirePage } from "@/lib/access";
import { isSuperAdmin } from "@/lib/access-policy";
import { createClient } from "@/lib/supabase/server";
import { Flash, PageHeader, SectionTitle, formatDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { setMentorAssignment, setScope } from "../actions";

type UserRow = { id: string; email: string; display_name: string; status: string; roles: string[] };
const RELATION: Record<string, string> = { mentor: "メンター", trainer: "トレーナー", leader: "リーダー" };

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const access = await requirePage({ kind: "admin" }, "/admin/assignments");
  const sp = await searchParams;
  const superAdmin = isSuperAdmin(access);
  const supabase = await createClient();
  const [{ data: list }, { data: scopes }, { data: assignments }] = await Promise.all([
    supabase.rpc("admin_list_users", { p_search: null, p_status: "active", p_limit: 200, p_offset: 0 }),
    supabase.from("admin_user_scopes").select("id, admin_id, user_id, created_at").is("revoked_at", null).order("created_at", { ascending: false }),
    supabase.from("mentor_assignments").select("id, mentor_id, user_id, relation, active_from").is("active_to", null).order("active_from", { ascending: false }),
  ]);
  const users = ((list ?? {}) as { users?: UserRow[] }).users ?? [];
  const label = new Map(users.map((u) => [u.id, u.display_name ? `${u.display_name}（${u.email}）` : u.email]));
  label.set(access.user_id!, `${access.display_name || access.email}（自分）`);
  const name = (id: string) => label.get(id) ?? id.slice(0, 8) + "…";
  const admins = users.filter((u) => u.roles.includes("admin") && !u.roles.includes("super_admin"));
  const mentors = users.filter((u) => u.roles.includes("mentor"));
  const members = users.filter((u) => !u.roles.includes("admin") && !u.roles.includes("super_admin"));

  return (
    <>
      <PageHeader en="ASSIGNMENTS" ja="担当者管理" desc="Admin の担当範囲と、メンター／トレーナー／リーダーの担当を設定します。担当を外すと、その担当者への共有は自動的に撤回されます。" />
      <Flash ok={sp.ok} error={sp.error} />

      <SectionTitle en="MENTOR / TRAINER / LEADER" ja="伴走担当" />
      <form action={setMentorAssignment} className="card row">
        <input type="hidden" name="assign" value="true" />
        <input type="hidden" name="back" value="/admin/assignments" />
        <div className="field"><label htmlFor="mentor_id">担当者（Mentor ロール）</label>
          <select id="mentor_id" name="mentor_id" required defaultValue="">
            <option value="" disabled>選択してください</option>
            {mentors.map((m) => <option key={m.id} value={m.id}>{name(m.id)}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="user_id_m">利用者</label>
          <select id="user_id_m" name="user_id" required defaultValue="">
            <option value="" disabled>選択してください</option>
            {members.map((m) => <option key={m.id} value={m.id}>{name(m.id)}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: "0 1 160px" }}><label htmlFor="relation">区分</label>
          <select id="relation" name="relation" defaultValue="mentor">
            <option value="mentor">メンター</option><option value="trainer">トレーナー</option><option value="leader">リーダー</option>
          </select>
        </div>
        <div className="field" style={{ flex: "0 0 auto" }}><SubmitButton>担当を設定</SubmitButton></div>
      </form>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th>担当者</th><th>区分</th><th>利用者</th><th>開始</th><th></th></tr></thead>
          <tbody>
            {(assignments ?? []).map((a) => (
              <tr key={a.id}>
                <td>{name(a.mentor_id)}</td><td>{RELATION[a.relation] ?? a.relation}</td><td>{name(a.user_id)}</td><td className="small">{formatDateTime(a.active_from)}</td>
                <td className="actions">
                  <form action={setMentorAssignment}>
                    <input type="hidden" name="mentor_id" value={a.mentor_id} /><input type="hidden" name="user_id" value={a.user_id} />
                    <input type="hidden" name="relation" value={a.relation} /><input type="hidden" name="assign" value="false" />
                    <input type="hidden" name="back" value="/admin/assignments" />
                    <SubmitButton className="btn small danger" confirm="担当を解除します。この担当者への共有も撤回されます。">解除</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
            {!(assignments ?? []).length ? <tr><td colSpan={5} className="muted">担当はありません。</td></tr> : null}
          </tbody>
        </table>
      </div>

      <SectionTitle en="ADMIN SCOPE" ja="Admin の担当範囲" />
      {superAdmin ? (
        <form action={setScope} className="card row">
          <input type="hidden" name="assign" value="true" />
          <input type="hidden" name="back" value="/admin/assignments" />
          <div className="field"><label htmlFor="admin_id">Admin</label>
            <select id="admin_id" name="admin_id" required defaultValue="">
              <option value="" disabled>選択してください</option>
              {admins.map((m) => <option key={m.id} value={m.id}>{name(m.id)}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="user_id_s">担当する利用者</label>
            <select id="user_id_s" name="user_id" required defaultValue="">
              <option value="" disabled>選択してください</option>
              {members.map((m) => <option key={m.id} value={m.id}>{name(m.id)}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: "0 0 auto" }}><SubmitButton>担当範囲に追加</SubmitButton></div>
        </form>
      ) : <p className="muted small">担当範囲の変更は Super Admin が行います。あなたの担当範囲は以下のとおりです。</p>}
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th>Admin</th><th>担当利用者</th><th>設定日</th><th></th></tr></thead>
          <tbody>
            {(scopes ?? []).map((s) => (
              <tr key={s.id}>
                <td>{name(s.admin_id)}</td><td>{name(s.user_id)}</td><td className="small">{formatDateTime(s.created_at)}</td>
                <td className="actions">
                  {superAdmin ? (
                    <form action={setScope}>
                      <input type="hidden" name="admin_id" value={s.admin_id} /><input type="hidden" name="user_id" value={s.user_id} />
                      <input type="hidden" name="assign" value="false" /><input type="hidden" name="back" value="/admin/assignments" />
                      <SubmitButton className="btn small danger">外す</SubmitButton>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
            {!(scopes ?? []).length ? <tr><td colSpan={4} className="muted">設定はありません。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
