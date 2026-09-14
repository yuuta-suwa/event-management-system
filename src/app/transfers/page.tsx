import {ArrowRightLeft,History,ShieldCheck} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {transferTicket} from "@/features/transfers/actions";
import {transferPageData} from "@/features/transfers/data";
import {requireUser} from "@/server/authz";

export default async function TransfersPage({searchParams}:{searchParams:Promise<{notice?:string}>}){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const {notice}=await searchParams;
  const {tickets,history}=await transferPageData(user);
  return <><AppHeader active="transfers"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">TICKET TRANSFER</p><h1>チケット譲渡</h1><p>参加者の名義を変更し、旧QRを失効して新しいQRを発行します。</p></div></div>
    {notice&&<div className="success-banner">{notice==="demo"?"ローカルデモでは変更を保存せず、操作フローだけ確認できます。":"譲渡が完了しました。旧QRは失効し、入金状態を引き継いだ新QRを発行しました。"}</div>}
    <section className="transfer-layout"><form action={transferTicket} className="transfer-form"><header><ArrowRightLeft/><div><h2>名義変更を実行</h2><p>受付済み・使用済みのチケットは譲渡できません。</p></div></header>
      <label>対象チケット<select name="ticketId" required defaultValue=""><option value="" disabled>チケットを選択</option>{tickets.map(ticket=><option value={ticket.id} key={ticket.id}>{ticket.ticketNumber}｜{ticket.participantName}｜{ticket.eventName}｜{ticket.paymentStatus}</option>)}</select></label>
      <div className="transfer-fields"><label>新しい参加者名<input name="name" required maxLength={100}/></label><label>フリガナ<input name="nameKana" required maxLength={120}/></label><label>電話番号<input name="phone" type="tel" required minLength={8} maxLength={20}/></label><label>メールアドレス<input name="email" type="email" required/></label></div>
      <label>譲渡理由<textarea name="reason" required minLength={5} maxLength={500} rows={4}/></label>
      <div className="transfer-policy"><ShieldCheck/><span>入金状態は維持されます。実行後、現在のQRコードは即時に使用できなくなります。</span></div>
      <button disabled={!tickets.length}>譲渡して新QRを発行</button>
    </form><section className="transfer-history"><header><History/><div><h2>譲渡履歴</h2><p>直近100件の監査記録</p></div></header>{history.length?<div>{history.map(item=><article key={item.id}><div><strong>{item.oldName}</strong><ArrowRightLeft/><strong>{item.newName}</strong></div><code>{item.ticketNumber}</code><p>{item.eventName}</p><small>{item.createdAt.toLocaleString("ja-JP")}・担当 {item.operatorName}</small><blockquote>{item.reason}</blockquote></article>)}</div>:<p className="empty-transfer">譲渡履歴はありません。</p>}</section></section>
  </main></>
}
