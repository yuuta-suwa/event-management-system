import Link from "next/link";
import {ArrowRightLeft,Banknote,Wallet} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {listAccessibleEvents} from "@/features/collection/access";
import {adjustRemittanceAmount,cancelRemittance,confirmRemittanceReceived,createRemittance,reportRemittanceSent} from "@/features/collection/remittance-actions";
import {getRemittanceView} from "@/features/collection/data";
import {receiptMethods} from "@/features/collection/domain";
import {requireUser} from "@/server/authz";
const yen=(n:number)=>`¥${n.toLocaleString("ja-JP")}`;
const date=(d:Date|null)=>d?d.toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo"}):"—";
const notices:Record<string,string>={remittance_created:"送金予定を登録しました。",remittance_reported:"送金済みを報告しました。決裁権者の受領確認をお待ちください。",remittance_received:"受領を確認し、照合が完了しました。",remittance_discrepancy:"差異ありとして記録しました。送金側が金額を訂正すると照合できます。",remittance_adjusted:"送金額を訂正しました。",remittance_cancelled:"送金を取り消しました。",demo:"ローカルデモでは保存されません。"};
const errors:Record<string,string>={invalid:"入力内容を確認してください。",forbidden:"この操作を行う権限がありません。",not_found:"対象が見つかりません。",invalid_transition:"現在の状態ではこの操作はできません。",exceeds_custody:"預り金残高を超える金額は送金できません。",invalid_recipient:"送金先は決裁権者である必要があります。",self_remittance:"ご自身には送金できません。",reason_required:"理由を入力してください。",conflict:"他の操作と競合しました。もう一度お試しください。"};
const chip=(s:string)=>s==="RECEIVED"?"paid":s==="CANCELLED"?"cancelled":s==="DISCREPANCY"?"unpaid":"pending";
export default async function RemittancesPage({searchParams}:{searchParams:Promise<{event?:string;notice?:string;error?:string}>}){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"]);
  const q=await searchParams;
  const events=await listAccessibleEvents(user);
  const eventId=events.find(e=>e.id===q.event)?.id??events[0]?.id;
  const view=eventId?await getRemittanceView(user,eventId):null;
  const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Tokyo"});
  return <><AppHeader active="collection"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">REMITTANCE</p><h1>送金・受領照合</h1><p>集金担当者から決裁権者への送金を、双方の確認で照合します。</p></div>
      <form className="year-picker"><select name="event" defaultValue={eventId} aria-label="イベント">{events.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><button>表示</button></form></div>
    {q.notice&&<div className="success-banner">{notices[q.notice]??"保存しました。"}</div>}
    {q.error&&<div className="form-banner" role="alert">{errors[q.error]??"処理に失敗しました。"}</div>}
    {!view?<div className="empty-state"><Wallet/><h2>このイベントの送金に関する役割がありません</h2><p>集金担当者または決裁権者として割り当てられると表示されます。</p></div>:<>
      <p className="collection-links"><Link href={`/collection?event=${view.event.id}`}>← 集金管理へ戻る</Link></p>
      {view.custody&&<section className="payment-summary">
        <article><Banknote/><span>実入金（担当分）<strong>{yen(view.custody.received)}</strong></span></article>
        <article><ArrowRightLeft/><span>送金済み<strong>{yen(view.custody.committed)}</strong></span></article>
        <article><Wallet/><span>うち未照合<strong>{yen(view.custody.unreconciled)}</strong></span></article>
        <article className="revenue-card"><Wallet/><span>送金できる預り金<strong>{yen(view.custody.available)}</strong></span></article>
      </section>}
      {view.access.approver&&<section className="payment-summary">
        <article><Banknote/><span>受領済み（照合完了）<strong>{yen(view.totals.reconciled)}</strong></span></article>
        <article><ArrowRightLeft/><span>受領確認待ち・差異あり<strong>{yen(view.totals.unreconciled)}</strong></span></article>
      </section>}
      {view.custody&&<section className="collection-section"><h2>送金を登録</h2>
        <form action={createRemittance.bind(null,view.event.id)} className="expense-form">
          <label>送金先（決裁権者）<select name="recipientId" required defaultValue=""><option value="" disabled>選択してください</option>{view.recipients.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label>送金額（円）<input name="amount" type="number" min="1" max={view.custody.available} required/></label>
          <label>方法<select name="method" defaultValue="BANK_TRANSFER">{Object.entries(receiptMethods).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
          <label>送金予定日（任意）<input name="plannedAt" type="date"/></label>
          <label>メモ（任意）<input name="note" maxLength={300}/></label>
          <button>送金予定を登録</button>
        </form>
        <p className="hint">送金は預り金から差し引かれるだけで、売上や経費にはなりません。決裁権者が受領を確認すると照合完了です。</p></section>}
      <section className="collection-section"><h2>送金一覧</h2>
        {view.remittances.map(r=><article className="advance-card" key={r.id}>
          <header><strong>{r.senderName} → {r.recipientName}　{yen(r.amount)}</strong><span className={`payment-chip payment-${chip(r.status)}`}>{r.statusLabel}</span></header>
          <dl><dt>方法</dt><dd>{receiptMethods[r.method]??r.method}</dd><dt>予定日 / 送金日 / 受領日</dt><dd>{date(r.plannedAt)} / {date(r.sentAt)} / {date(r.receivedAt)}</dd>{r.receivedAmount!==null&&<><dt>受領額</dt><dd>{yen(r.receivedAmount)}</dd></>}{r.note&&<><dt>メモ</dt><dd>{r.note}</dd></>}{r.evidenceNote&&<><dt>証憑メモ</dt><dd>{r.evidenceNote}</dd></>}{r.discrepancyNote&&<><dt>差異の理由</dt><dd>{r.discrepancyNote}</dd></>}{r.cancelReason&&<><dt>取消理由</dt><dd>{r.cancelReason}</dd></>}</dl>
          {r.mineAsSender&&r.status==="PLANNED"&&<form action={reportRemittanceSent.bind(null,view.event.id)} className="inline-form"><input type="hidden" name="id" value={r.id}/><input name="sentAt" type="date" defaultValue={today} required/><select name="method" defaultValue={r.method}>{Object.entries(receiptMethods).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><input name="evidenceNote" placeholder="振込控え等のメモ" maxLength={300}/><button>送金済みを報告</button></form>}
          {r.mineAsSender&&r.status==="DISCREPANCY"&&<form action={adjustRemittanceAmount.bind(null,view.event.id)} className="inline-form"><input type="hidden" name="id" value={r.id}/><input name="amount" type="number" min="1" defaultValue={r.receivedAmount??r.amount} required/><button>送金額を訂正</button></form>}
          {r.mineAsRecipient&&(r.status==="SENT_REPORTED"||r.status==="DISCREPANCY")&&<form action={confirmRemittanceReceived.bind(null,view.event.id)} className="inline-form"><input type="hidden" name="id" value={r.id}/><input name="receivedAmount" type="number" min="0" defaultValue={r.amount} required/><input name="receivedAt" type="date" defaultValue={today}/><input name="discrepancyNote" placeholder="金額が違う場合は理由" maxLength={300}/><button>受領を確認</button></form>}
          {r.mineAsSender&&["PLANNED","SENT_REPORTED","DISCREPANCY"].includes(r.status)&&<form action={cancelRemittance.bind(null,view.event.id)} className="inline-form"><input type="hidden" name="id" value={r.id}/><input name="reason" placeholder="取消理由" required minLength={3} maxLength={300}/><button className="line-unlink">取り消す</button></form>}
        </article>)}
        {view.remittances.length===0&&<div className="empty-state"><ArrowRightLeft/><h2>送金の記録はありません</h2></div>}
      </section></>}
  </main></>;
}
