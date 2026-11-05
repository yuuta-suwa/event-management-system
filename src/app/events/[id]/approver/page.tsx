import {notFound} from "next/navigation";
import {ShieldCheck} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {requireUser} from "@/server/authz";
import {db} from "@/server/db";
import {cancelApproverChange,confirmApproverChange,requestApproverChange} from "@/features/ledger/approver-actions";
import {EMERGENCY_APPROVALS_REQUIRED} from "@/features/ledger/approver-domain";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;
const notices:Record<string,string>={requested:"決裁権者の変更を申請しました。必要な確認がそろうと自動で切り替わります。",confirmed:"確認しました。",completed:"決裁権者を切り替えました。",cancelled:"申請を取り消しました。",demo:"ローカルデモでは保存されません。"};
const errors:Record<string,string>={invalid:"入力内容を確認してください。",forbidden:"この操作を行う権限がありません。",not_found:"対象が見つかりません。",not_pending:"すでに処理済みの申請です。",already_pending:"確認待ちの申請があります。先に完了または取り消してください。",invalid_new:"新しい決裁権者には、有効なスタッフアカウントを指定してください。",self_promotion:"決裁権者がいるイベントで、自分自身を決裁権者にする申請はできません。",needs_current:"交代する現決裁権者を選択してください。",bad_current:"選択した方は現在の決裁権者ではありません。",same:"すでに決裁権者です。",emergency_not_needed:"決裁権者が未設定のため、緊急フローは不要です。",already_confirmed:"すでに確認済みです。",pending_remittances:"旧決裁権者宛ての未完了の送金があります。受領確認または取消のあとに切り替えてください。",conflict:"他の操作と競合しました。もう一度お試しください。"};
const status:Record<string,string>={PENDING:"確認待ち",COMPLETED:"完了",CANCELLED:"取消"};
const jst=(d:Date|null)=>d?d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
export default async function ApproverPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{notice?:string;error?:string}>}){
  const user=await requireUser(STAFF);
  const [{id},q]=await Promise.all([params,searchParams]);
  const event=await db.event.findUnique({where:{id},select:{id:true,name:true,managerId:true}});
  if(!event)notFound();
  const [assignments,requests]=await Promise.all([
    db.eventRoleAssignment.findMany({where:{eventId:id,role:"APPROVER",active:true},include:{user:{select:{id:true,name:true,email:true}}}}),
    db.approverChangeRequest.findMany({where:{eventId:id},orderBy:{createdAt:"desc"},take:10,include:{approvals:true}}),
  ]);
  const isAdmin=user.role==="SUPER_ADMIN";
  const isCurrent=assignments.some(a=>a.userId===user.id);
  const involved=requests.some(r=>r.status==="PENDING"&&(r.newApproverId===user.id||r.currentApproverId===user.id));
  if(!isAdmin&&!isCurrent&&!involved&&event.managerId!==user.id)notFound();
  const ids=[...new Set(requests.flatMap(r=>[r.currentApproverId,r.newApproverId,r.requestedBy,...r.approvals.map(a=>a.userId)]).filter(Boolean) as string[])];
  const names=new Map((await db.user.findMany({where:{id:{in:ids}},select:{id:true,name:true}})).map(u=>[u.id,u.name]));
  const candidates=isAdmin||isCurrent?await db.user.findMany({where:{status:"ACTIVE",role:{not:"PARTICIPANT"}},select:{id:true,name:true,email:true,role:true},orderBy:{name:"asc"},take:200}):[];
  const pending=requests.find(r=>r.status==="PENDING");
  const nm=(i:string|null)=>i?names.get(i)??"—":"—";
  return <><AppHeader active="events"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">APPROVER</p><h1>決裁権者の指定・変更</h1><p>{event.name}</p></div></div>
    {q.notice&&<div className="success-banner">{notices[q.notice]??"保存しました。"}</div>}
    {q.error&&<div className="form-banner" role="alert">{errors[q.error]??"処理に失敗しました。"}</div>}
    <section className="collection-section"><h2><ShieldCheck size={18}/> 現在の決裁権者</h2>
      {assignments.length===0?<p className="hint">決裁権者が未設定です。この間は SUPER_ADMIN が暫定で承認・受領確認できますが、非公開帳簿は誰も閲覧できません。</p>
        :assignments.map(a=><p key={a.id}><strong>{a.user.name}</strong>（{a.user.email}）</p>)}
      <p className="hint">非公開帳簿・送金の受領・立替の承認・店舗支払は、決裁権者が行います。決裁権者が指定されたイベントの収支（売上・経費・利益）は、決裁権者以外（SUPER_ADMINを含む）には表示されません。</p></section>
    {pending&&<section className="collection-section"><h2>確認待ちの申請{pending.emergency&&"（緊急）"}</h2>
      <p>{assignments.length>0?`${nm(pending.currentApproverId)} → `:"新規指定 → "}<strong>{nm(pending.newApproverId)}</strong>　申請者: {nm(pending.requestedBy)}（{jst(pending.createdAt)}）</p>
      <p className="hint">理由: {pending.reason}</p>
      <ul className="check-list"><li>新決裁権者の本人確認: {pending.newConfirmedAt?`済（${jst(pending.newConfirmedAt)}）`:"未"}</li>
        {pending.currentApproverId&&!pending.emergency&&<li>現決裁権者の確認: {pending.currentConfirmedAt?`済（${jst(pending.currentConfirmedAt)}）`:"未"}</li>}
        {pending.emergency&&<li>SUPER_ADMINの承認: {pending.approvals.filter(a=>a.userId!==pending.newApproverId).length}/{EMERGENCY_APPROVALS_REQUIRED}名（{pending.approvals.map(a=>nm(a.userId)).join("、")||"—"}）</li>}</ul>
      <div className="inline-form">
        {(user.id===pending.newApproverId&&!pending.newConfirmedAt||user.id===pending.currentApproverId&&!pending.currentConfirmedAt&&!pending.emergency||pending.emergency&&isAdmin&&user.id!==pending.newApproverId&&!pending.approvals.some(a=>a.userId===user.id))&&<form action={confirmApproverChange.bind(null,id)}><input type="hidden" name="requestId" value={pending.id}/><button>{user.id===pending.newApproverId?"決裁権者になることを承諾する":user.id===pending.currentApproverId?"交代を承認する":"緊急変更を承認する"}</button></form>}
        {(user.id===pending.requestedBy||user.id===pending.currentApproverId||user.id===pending.newApproverId||(pending.emergency&&isAdmin))&&<form action={cancelApproverChange.bind(null,id)}><input type="hidden" name="requestId" value={pending.id}/><button className="line-unlink">申請を取り消す</button></form>}
      </div></section>}
    {!pending&&(isAdmin||isCurrent)&&<section className="collection-section"><h2>{assignments.length>0?"決裁権者を変更する":"決裁権者を指定する"}</h2>
      <form action={requestApproverChange.bind(null,id)} className="expense-form">
        {assignments.length>0&&<label>交代する現決裁権者<select name="currentApproverId" required>{assignments.map(a=><option key={a.userId} value={a.userId}>{a.user.name}</option>)}</select></label>}
        <label>新しい決裁権者<select name="newApproverId" required><option value="">選択してください</option>{candidates.filter(c=>!assignments.some(a=>a.userId===c.id)).map(c=><option key={c.id} value={c.id}>{c.name}（{c.email}）</option>)}</select></label>
        <label>理由<input name="reason" required minLength={3} maxLength={300} placeholder="例：担当者の異動のため"/></label>
        {assignments.length>0&&isAdmin&&<label className="check-row"><input type="checkbox" name="emergency"/>緊急変更（現決裁権者の確認が得られない場合。新決裁権者の承諾と、SUPER_ADMIN{EMERGENCY_APPROVALS_REQUIRED}名の承認が必要）</label>}
        <button>申請する</button>
      </form>
      <p className="hint">通常は「現決裁権者の承認」と「新決裁権者の承諾」がそろった時点で切り替わります。自分自身を新しい決裁権者にする申請は、決裁権者がいるイベントではできません。</p></section>}
    <section className="collection-section"><h2>変更履歴</h2>
      {requests.length===0?<p className="hint">履歴はありません。</p>:<table className="data-table"><thead><tr><th>申請日時</th><th>変更</th><th>申請者</th><th>状態</th></tr></thead><tbody>{requests.map(r=><tr key={r.id}><td>{jst(r.createdAt)}</td><td>{nm(r.currentApproverId)} → {nm(r.newApproverId)}{r.emergency&&"（緊急）"}</td><td>{nm(r.requestedBy)}</td><td>{status[r.status]??r.status}</td></tr>)}</tbody></table>}</section>
  </main></>;
}
