import {ArrowRightLeft,History} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {TransferForm} from "@/features/transfers/transfer-form";
import {transferPageData} from "@/features/transfers/data";
import {requireUser} from "@/server/authz";

export default async function TransfersPage({searchParams}:{searchParams:Promise<{notice?:string}>}){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const {notice}=await searchParams;
  const {tickets,history}=await transferPageData(user);
  return <><AppHeader active="transfers"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">TICKET TRANSFER</p><h1>チケット譲渡</h1><p>参加者の名義を変更し、旧QRを失効して新しいQRを発行します。</p></div></div>
    {notice&&<div className="success-banner">{notice==="demo"?"ローカルデモでは変更を保存せず、操作フローだけ確認できます。":"譲渡が完了しました。旧QRは失効し、入金状態を引き継いだ新QRを発行しました。新しい保有者にメールを送っています。"}</div>}
    <section className="transfer-layout"><TransferForm tickets={tickets}/><section className="transfer-history"><header><History/><div><h2>譲渡履歴</h2><p>直近100件の監査記録</p></div></header>{history.length?<div>{history.map(item=><article key={item.id}><div><strong>{item.oldName}</strong><ArrowRightLeft/><strong>{item.newName}</strong></div><code>{item.ticketNumber}</code><p>{item.eventName}</p><small>{item.createdAt.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})}・担当 {item.operatorName}</small><blockquote>{item.reason}</blockquote></article>)}</div>:<p className="empty-transfer">譲渡履歴はありません。</p>}</section></section>
  </main></>
}
