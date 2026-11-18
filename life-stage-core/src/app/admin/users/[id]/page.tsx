import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePage } from "@/lib/access";
import { isSuperAdmin } from "@/lib/access-policy";
import { createClient } from "@/lib/supabase/server";
import { Flash, PageHeader, RoleBadges, SectionTitle, StatusBadge, formatDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { decideDeletion, requestDeletion, setAppRole, setEntitlement, setRole, setUserStatus } from "../../actions";

export default async function UserDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const access = await requirePage({ kind: "admin" }, `/admin/users/${id}`);
  const sp = await searchParams;
  const supabase = await createClient();
  // RLS：担当範囲外の利用者は profile が取得できない → 404
  const { data: user } = await supabase.from("profiles").select("id, email, display_name, status, status_reason, status_changed_at, created_at").eq("id", id).maybeSingle();
  if (!user) notFound();

  const [{ data: apps }, { data: ents }, { data: roles }, { data: deletions }, { data: logs }, { data: mentors }, { data: roleDefs }, { data: appRoles }] = await Promise.all([
    supabase.from("apps").select("code, name_en, name_ja, is_active").order("sort_order"),
    supabase.from("app_entitlements").select("app_code, status, granted_at, revoked_at, reason").eq("user_id", id),
    supabase.from("admin_roles").select("role").eq("user_id", id).is("revoked_at", null),
    supabase.from("deletion_requests").select("id, status, source, reason, requested_at, confirmed_at").eq("user_id", id).order("requested_at", { ascending: false }),
    supabase.from("audit_logs").select("id, occurred_at, action, reason, success, actor_id").eq("target_user_id", id).order("occurred_at", { ascending: false }).limit(30),
    supabase.from("mentor_assignments").select("id, mentor_id, relation, active_from, active_to").eq("user_id", id).is("active_to", null),
    supabase.from("app_role_definitions").select("app_code, role_code, name_en, name_ja, grantable_by, scoped").eq("is_active", true).order("app_code"),
    supabase.from("user_app_roles").select("id, app_code, role_code, scope_key, granted_at").eq("user_id", id).is("revoked_at", null),
  ]);
  const entMap = new Map((ents ?? []).map((e) => [e.app_code, e]));
  const roleList = (roles ?? []).map((r) => r.role as string);
  const openDeletion = (deletions ?? []).find((d) => d.status === "requested" || d.status === "confirmed");
  const self = access.user_id === id;
  const backTo = `/admin/users/${id}`;
  const superAdmin = isSuperAdmin(access);

  return (
    <>
      <PageHeader en="USER DETAIL" ja={user.display_name || user.email} desc={user.email}>
        <Link href="/admin/users" className="btn ghost small">← 一覧へ</Link>
      </PageHeader>
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid two">
        <div className="card">
          <SectionTitle en="STATUS" ja="利用状態" />
          <dl className="kv">
            <dt>状態</dt><dd><StatusBadge status={user.status} /></dd>
            <dt>理由</dt><dd>{user.status_reason ?? "—"}</dd>
            <dt>変更日時</dt><dd>{formatDateTime(user.status_changed_at)}</dd>
            <dt>登録日</dt><dd>{formatDateTime(user.created_at)}</dd>
            <dt>役割</dt><dd><RoleBadges roles={roleList} /></dd>
          </dl>
          {!self ? (
            <form action={setUserStatus} style={{ marginTop: 16 }}>
              <input type="hidden" name="user_id" value={id} />
              <input type="hidden" name="back" value={backTo} />
              <div className="field"><label htmlFor="reason">理由<small>監査ログに記録されます</small></label><input id="reason" name="reason" type="text" maxLength={500} /></div>
              <div className="row">
                {user.status === "active" ? (
                  <>
                    <button name="action" value="suspend" className="btn danger" type="submit">一時停止｜Suspend</button>
                    <button name="action" value="revoke" className="btn danger" type="submit">利用権剥奪｜Revoke</button>
                  </>
                ) : null}
                {user.status === "suspended" || user.status === "revoked" ? (
                  <button name="action" value="resume" className="btn" type="submit">利用再開｜Resume</button>
                ) : null}
              </div>
              <p className="small muted">停止してもデータは保持されます。停止中はログイン中のセッションを含め、すべての画面・API・DBアクセスが拒否されます。</p>
            </form>
          ) : <p className="muted small">自分自身の状態は変更できません。</p>}
        </div>

        <div className="card">
          <SectionTitle en="APP ACCESS" ja="アプリ別権限" />
          <div className="table-wrap">
            <table>
              <thead><tr><th>アプリ</th><th>状態</th><th></th></tr></thead>
              <tbody>
                {(apps ?? []).filter((a) => a.is_active).map((a) => {
                  const e = entMap.get(a.code);
                  const on = e?.status === "active";
                  return (
                    <tr key={a.code}>
                      <td><b>{a.code}</b><div className="small muted">{a.name_en}</div></td>
                      <td>{on ? <span className="badge ok">許可</span> : <span className="badge plain">なし</span>}</td>
                      <td className="actions">
                        <form action={setEntitlement}>
                          <input type="hidden" name="user_id" value={id} />
                          <input type="hidden" name="app_code" value={a.code} />
                          <input type="hidden" name="grant" value={on ? "false" : "true"} />
                          <input type="hidden" name="back" value={backTo} />
                          <SubmitButton className={`btn small ${on ? "danger" : ""}`}>{on ? "取り消す" : "許可する"}</SubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">APP01 の許可は APP02・APP03 を含みません。アプリごとに個別に設定します。</p>
        </div>
      </div>

      {superAdmin && !self ? (
        <div className="card">
          <SectionTitle en="ROLES" ja="役割（Super Admin のみ）" />
          <div className="row">
            {(["admin", "mentor", "super_admin"] as const).map((r) => {
              const has = roleList.includes(r);
              return (
                <form key={r} action={setRole}>
                  <input type="hidden" name="user_id" value={id} />
                  <input type="hidden" name="role" value={r} />
                  <input type="hidden" name="grant" value={has ? "false" : "true"} />
                  <input type="hidden" name="back" value={backTo} />
                  <SubmitButton className={`btn small ${has ? "danger" : "ghost"}`} confirm={`${r} を${has ? "外し" : "付与し"}ます。よろしいですか？`}>
                    {has ? `${r} を外す` : `${r} を付与`}
                  </SubmitButton>
                </form>
              );
            })}
          </div>
          <p className="small muted">Admin は担当範囲（ASSIGNMENTS）内の利用者のみ管理できます。Mentor は本人が共有した情報のみ閲覧できます。</p>
        </div>
      ) : null}

      <div className="card">
        <SectionTitle en="APP ROLES" ja="アプリ固有の役割" />
        <p className="small muted">例：APP02 の LEGACY 利用資格、APP03 の認定審査者・事業管理者。アプリの利用権限がある場合のみ付与できます。</p>
        {(appRoles ?? []).length ? (
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table>
              <thead><tr><th>アプリ</th><th>役割</th><th>対象範囲</th><th>付与日</th><th></th></tr></thead>
              <tbody>
                {(appRoles ?? []).map((r) => {
                  const def = (roleDefs ?? []).find((d) => d.app_code === r.app_code && d.role_code === r.role_code);
                  return (
                    <tr key={r.id}>
                      <td>{r.app_code}</td><td>{def ? `${def.name_ja}（${def.name_en}）` : r.role_code}</td>
                      <td>{r.scope_key || "—"}</td><td className="small">{formatDateTime(r.granted_at)}</td>
                      <td className="actions">
                        {!self ? (
                          <form action={setAppRole}>
                            <input type="hidden" name="user_id" value={id} /><input type="hidden" name="app_code" value={r.app_code} />
                            <input type="hidden" name="role_code" value={r.role_code} /><input type="hidden" name="scope_key" value={r.scope_key} />
                            <input type="hidden" name="grant" value="false" /><input type="hidden" name="back" value={backTo} />
                            <SubmitButton className="btn small danger" confirm="この役割を外します。よろしいですか？">外す</SubmitButton>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">付与されているアプリ固有の役割はありません。</p>}
        {!self && (roleDefs ?? []).length ? (
          <form action={setAppRole} className="row">
            <input type="hidden" name="user_id" value={id} />
            <input type="hidden" name="grant" value="true" />
            <input type="hidden" name="back" value={backTo} />
            <div className="field"><label htmlFor="app_role">役割</label>
              <select id="app_role" name="role_key" required defaultValue="">
                <option value="" disabled>選択してください</option>
                {(roleDefs ?? []).map((d) => (
                  <option key={`${d.app_code}:${d.role_code}`} value={`${d.app_code}:${d.role_code}`}>
                    {d.app_code}｜{d.name_ja}{d.scoped ? "（範囲必須）" : ""}{d.grantable_by === "super_admin" ? "［SA］" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field"><label htmlFor="scope_key">対象範囲<small>例：事業ID（範囲必須の役割のみ）</small></label><input id="scope_key" name="scope_key" type="text" maxLength={120} /></div>
            <div className="field"><label htmlFor="app_role_reason">理由</label><input id="app_role_reason" name="reason" type="text" maxLength={500} /></div>
            <div className="field" style={{ flex: "0 0 auto" }}><SubmitButton>付与する</SubmitButton></div>
          </form>
        ) : null}
      </div>

      <div className="card">
        <SectionTitle en="MENTORS" ja="担当メンター等" />
        {(mentors ?? []).length ? (
          <ul>{(mentors ?? []).map((m) => <li key={m.id}><span className="mono small">{m.mentor_id}</span>（{m.relation}）</li>)}</ul>
        ) : <p className="muted">担当者は設定されていません。</p>}
        <Link href="/admin/assignments" className="small">担当者管理で変更 →</Link>
      </div>

      <div className="card">
        <SectionTitle en="DELETION" ja="アカウント削除手続き" />
        {openDeletion ? (
          <>
            <p>状態：<StatusBadge status={openDeletion.status} />（申請：{formatDateTime(openDeletion.requested_at)}／{openDeletion.source === "self" ? "本人" : "管理者"}）</p>
            <p className="small">理由：{openDeletion.reason ?? "—"}</p>
            {superAdmin ? (
              <div className="row">
                {openDeletion.status === "requested" ? (
                  <form action={decideDeletion}>
                    <input type="hidden" name="request_id" value={openDeletion.id} />
                    <input type="hidden" name="decision" value="confirm" />
                    <input type="hidden" name="back" value={backTo} />
                    <div className="field"><label htmlFor="confirm_email">確認のため対象のメールアドレスを入力</label><input id="confirm_email" name="confirm_email" type="email" required /></div>
                    <SubmitButton className="btn danger" confirm="削除手続きを確定し、アクセスを停止します。よろしいですか？">削除手続きを確定</SubmitButton>
                  </form>
                ) : null}
                <form action={decideDeletion}>
                  <input type="hidden" name="request_id" value={openDeletion.id} />
                  <input type="hidden" name="decision" value="cancel" />
                  <input type="hidden" name="back" value={backTo} />
                  <SubmitButton className="btn ghost">手続きを取り消す</SubmitButton>
                </form>
              </div>
            ) : <p className="small muted">確定・取消は Super Admin が行います。</p>}
          </>
        ) : !self ? (
          <details>
            <summary>削除手続きを申請する</summary>
            <form action={requestDeletion} style={{ marginTop: 12 }}>
              <input type="hidden" name="user_id" value={id} />
              <input type="hidden" name="back" value={backTo} />
              <div className="field"><label htmlFor="del_reason">理由（必須）<small>本人からの請求経路など</small></label><input id="del_reason" name="reason" type="text" required maxLength={500} /></div>
              <SubmitButton className="btn danger">申請する（Super Admin の確認が必要）</SubmitButton>
            </form>
          </details>
        ) : null}
        <p className="small muted">確定すると利用者のアクセスは停止されます。データの物理削除・バックアップの消去は運用手順（docs/OPERATIONS.md）に従います。</p>
      </div>

      <SectionTitle en="HISTORY" ja="この利用者に関する操作履歴" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>日時</th><th>操作</th><th>理由</th><th>結果</th></tr></thead>
          <tbody>
            {(logs ?? []).map((l) => (
              <tr key={l.id}><td className="small">{formatDateTime(l.occurred_at)}</td><td className="mono">{l.action}</td><td>{l.reason ?? "—"}</td>
                <td>{l.success ? <span className="badge ok">成功</span> : <span className="badge danger">失敗</span>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
