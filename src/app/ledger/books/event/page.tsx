import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {AppHeader} from "@/components/app-header";
import {requireUser} from "@/server/authz";
import {db} from "@/server/db";
import {canManageRoster,loadRosterEvent} from "@/features/roster/backfill-service";
import {listEventRenames} from "@/features/roster/event-service";
import {renameEventAction} from "@/features/roster/event-actions";
import {REASON_MAX} from "@/features/roster/edit-domain";
const jst=(d:Date)=>d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
const errors:Record<string,string>={reason_required:"変更の理由を入力してください。",reason_too_long:`変更の理由は${REASON_MAX}文字以内にしてください。`,invalid_name:"イベント名は2〜120文字で入力してください。",no_change:"名前が変わっていません。",forbidden:"このイベントの名前を変更する権限がありません。",not_found:"イベントが見つかりません。",conflict:"他の操作と競合しました。もう一度お試しください。"};
export default async function EventRenamePage({searchParams}:{searchParams:Promise<{event?:string;back?:string;error?:string}>}){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const q=await searchParams;
  if(!q.event)notFound();
  const event=await loadRosterEvent(db,q.event);
  if(!event)notFound();
  if(!canManageRoster(user,event))redirect("/ledger/books");
  const back=q.back&&/^\/ledger\/books(\?[\w=&%.-]*)?$/.test(q.back)?q.back:"/ledger/books";
  const history=await listEventRenames(event.id);
  return <><AppHeader active="ledger"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">EVENT NAME</p><h1>イベント名を変更</h1><p>現在の名前：{event.name}</p></div><Link className="secondary-link" href={back}>← 帳簿に戻る</Link></div>
    {q.error&&<div className="form-banner" role="alert">{errors[q.error]??"保存できませんでした。"}</div>}
    <form action={renameEventAction} className="ledger-edit-form">
      <input type="hidden" name="eventId" value={event.id}/><input type="hidden" name="back" value={back}/>
      <label className="wide">新しいイベント名<input name="name" required minLength={2} maxLength={120} defaultValue={event.name}/></label>
      <label className="wide"><strong>変更の理由（必須）</strong><textarea name="reason" rows={3} maxLength={REASON_MAX} required placeholder="例: 正式名称に合わせて修正／表記の統一"/></label>
      <div className="ledger-edit-actions"><button>理由つきで保存</button><Link href={back}>キャンセル</Link></div>
    </form>
    <section className="collection-section"><h2>名前の変更履歴</h2>
      {history.length===0?<p className="ledger-note">まだ変更されていません。</p>:<table className="data-table"><thead><tr><th>日時</th><th>変更した人</th><th>変更内容</th><th>理由</th></tr></thead><tbody>
        {history.map(h=><tr key={h.id}><td>{jst(h.at)}</td><td>{h.editor??"—"}</td><td>{h.before} → {h.after}</td><td>{h.reason||"—"}</td></tr>)}
      </tbody></table>}</section>
  </main></>;
}
