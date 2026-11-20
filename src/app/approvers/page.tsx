import Link from "next/link";
import {ShieldCheck} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {requireUser} from "@/server/authz";
import {db} from "@/server/db";
import {assignApproverDirect} from "@/features/ledger/approver-actions";
const notices:Record<string,string>={assigned:"決裁権者を指定しました。この決裁権者だけが帳簿を閲覧できます。",demo:"ローカルデモでは保存されません。"};
const errors:Record<string,string>={invalid:"決裁権者を選び、確認のチェックを入れてください。",forbidden:"この操作を行う権限がありません。",not_found:"イベントが見つかりません。",has_approver:"すでに決裁権者がいます。変更する場合は、各イベントの「変更する」から申請してください。",already_pending:"確認待ちの変更申請があります。先に完了または取り消してください。",invalid_new:"有効なスタッフアカウントを指定してください。",conflict:"他の操作と競合しました。もう一度お試しください。"};
const jstDate=(d:Date)=>d.toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"numeric",day:"numeric"});
/** 管理者(SUPER_ADMIN)が、全イベントの決裁権者を一覧で確認し、未設定のイベントに直接指定する画面。 */
export default async function ApproversPage({searchParams}:{searchParams:Promise<{notice?:string;error?:string}>}){
  await requireUser(["SUPER_ADMIN"]);
  const q=await searchParams;
  const [events,candidates]=await Promise.all([
    db.event.findMany({orderBy:{eventDate:"desc"},take:100,select:{id:true,name:true,eventDate:true,roleAssignments:{where:{role:"APPROVER",active:true},select:{user:{select:{name:true,email:true}}}},approverChanges:{where:{status:"PENDING"},select:{id:true}}}}),
    db.user.findMany({where:{status:"ACTIVE",role:{not:"PARTICIPANT"}},select:{id:true,name:true,email:true},orderBy:{name:"asc"},take:200}),
  ]);
  return <><AppHeader active="ledger"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">APPROVERS</p><h1>決裁権者の設定</h1><p>非公開帳簿を閲覧できるのは、イベントごとに指定された決裁権者だけです。ここで全イベントの指定状況を確認し、未設定のイベントに指定できます。</p></div></div>
    {q.notice&&<div className="success-banner">{notices[q.notice]??"保存しました。"}</div>}
    {q.error&&<div className="form-banner" role="alert">{errors[q.error]??"処理に失敗しました。"}</div>}
    <section className="collection-section"><h2><ShieldCheck size={18}/> 決裁権者の選び方</h2>
      <ul className="check-list">
        <li>指定できるのは、有効なスタッフアカウント（参加者アカウントは不可）です。先に「スタッフ」画面でアカウントを作っておいてください。</li>
        <li>決裁権者が未設定のイベントは、この画面（またはイベントの「決裁権者」画面）から管理者が直接指定でき、すぐに有効になります。</li>
        <li>すでに決裁権者がいるイベントの交代は、現決裁権者の承認と新決裁権者の承諾が必要です（管理者の独断で帳簿の閲覧者を入れ替えられないようにするためです）。</li>
        <li><strong>指定したイベントの収支・帳簿は、決裁権者以外（管理者を含む）には表示されなくなります。</strong>管理者が自分で帳簿を見たい場合は、自分自身を決裁権者に指定してください。</li>
      </ul></section>
    <section className="collection-section"><h2>イベント別の指定状況</h2>
      {events.length===0?<p className="hint">イベントがありません。</p>:<table className="data-table"><thead><tr><th>イベント</th><th>開催日</th><th>決裁権者</th><th>操作</th></tr></thead><tbody>
        {events.map(e=>{const ap=e.roleAssignments.map(a=>a.user);const pending=e.approverChanges.length>0;return <tr key={e.id}>
          <td><Link href={`/events/${e.id}`}>{e.name}</Link></td><td>{jstDate(e.eventDate)}</td>
          <td>{ap.length>0?ap.map(a=>`${a.name}（${a.email}）`).join("、"):<span className="hint">未設定</span>}{pending&&<small>　確認待ちの変更申請あり</small>}</td>
          <td>{ap.length>0||pending?<Link href={`/events/${e.id}/approver`}>{ap.length>0?"変更する":"申請を確認"}</Link>
            :<form action={assignApproverDirect.bind(null,e.id)} className="inline-form">
              <input type="hidden" name="returnTo" value="list"/>
              <select name="newApproverId" required aria-label={`${e.name}の決裁権者`}><option value="">選択</option>{candidates.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <label className="check-row"><input type="checkbox" name="ack" required/>管理者にも収支が非表示になることを理解した</label>
              <button>指定</button></form>}</td></tr>})}
      </tbody></table>}</section>
  </main></>;
}
