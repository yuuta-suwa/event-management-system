"use client";
import {useActionState} from "react";
import {ArrowRightLeft,ShieldCheck} from "lucide-react";
import {transferTicket,type TransferState} from "./actions";
type Ticket={id:string;ticketNumber:string;participantName:string;eventName:string;paymentStatus:string};
export function TransferForm({tickets}:{tickets:Ticket[]}){
  const [state,action,pending]=useActionState<TransferState,FormData>(transferTicket,{});
  const v=(k:string)=>state.values?.[k]??"";
  const err=(k:string)=>state.errors?.[k];
  return <form action={action} className="transfer-form"><header><ArrowRightLeft/><div><h2>名義変更を実行</h2><p>受付済み・使用済みのチケットは譲渡できません。</p></div></header>
    {state.message&&<div className="form-banner" role="alert">{state.message}</div>}
    <label>対象チケット<select name="ticketId" required defaultValue={v("ticketId")} key={`t-${v("ticketId")}`}><option value="" disabled>チケットを選択</option>{tickets.map(t=><option value={t.id} key={t.id}>{t.ticketNumber}｜{t.participantName}｜{t.eventName}｜{t.paymentStatus}</option>)}</select>{err("ticketId")&&<small className="field-error">{err("ticketId")}</small>}</label>
    <div className="transfer-fields">
      <label>新しい参加者名<input name="name" required maxLength={100} defaultValue={v("name")}/>{err("name")&&<small className="field-error">{err("name")}</small>}</label>
      <label>フリガナ<input name="nameKana" required maxLength={120} defaultValue={v("nameKana")}/>{err("nameKana")&&<small className="field-error">{err("nameKana")}</small>}</label>
      <label>電話番号<input name="phone" type="tel" required maxLength={24} defaultValue={v("phone")}/>{err("phone")&&<small className="field-error">{err("phone")}</small>}</label>
      <label>メールアドレス<input name="email" type="email" required defaultValue={v("email")}/>{err("email")&&<small className="field-error">{err("email")}</small>}</label>
    </div>
    <label>譲渡理由<textarea name="reason" required maxLength={500} rows={4} defaultValue={v("reason")}/>{err("reason")&&<small className="field-error">{err("reason")}</small>}</label>
    <div className="transfer-policy"><ShieldCheck/><span>入金状態は維持されます。実行後、現在のQRコードは即時に使用できなくなり、新しい保有者へチケットのメールを送ります。</span></div>
    <button disabled={!tickets.length||pending}>{pending?"処理中…":"譲渡して新QRを発行"}</button>
  </form>;
}
