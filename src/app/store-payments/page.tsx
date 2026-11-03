import Link from "next/link";
import {Banknote,ReceiptText,Wallet} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {listAccessibleEvents} from "@/features/collection/access";
import {createStorePayment,recordStorePayment,voidStorePaymentRecord} from "@/features/collection/store-actions";
import {getStorePaymentView} from "@/features/collection/data";
import {receiptMethods} from "@/features/collection/domain";
import {storePaymentLabel} from "@/features/collection/remittance-domain";
import {requireUser} from "@/server/authz";
const yen=(n:number)=>`¥${n.toLocaleString("ja-JP")}`;
const date=(d:Date|null)=>d?d.toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo"}):"—";
const notices:Record<string,string>={store_created:"支払先を登録しました。",store_paid:"支払を記録しました。",store_voided:"支払の記録を取り消しました。",demo:"ローカルデモでは保存されません。"};
const errors:Record<string,string>={invalid:"入力内容を確認してください。",forbidden:"この操作は決裁権者のみ可能です。",not_found:"対象が見つかりません。",expense_unavailable:"その経費はすでに店舗支払に紐づいているか、存在しません。",advance_expense:"立替の精算から計上された経費は、店舗支払に紐づけできません（二重計上の防止）。",exceeds_balance:"未払残高を超える金額は登録できません。",already_voided:"すでに取り消し済みです。",conflict:"他の操作と競合しました。もう一度お試しください。"};
export default async function StorePaymentsPage({searchParams}:{searchParams:Promise<{event?:string;notice?:string;error?:string}>}){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"]);
  const q=await searchParams;
  const events=await listAccessibleEvents(user);
  const eventId=events.find(e=>e.id===q.event)?.id??events[0]?.id;
  const view=eventId?await getStorePaymentView(user,eventId):null;
  const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Tokyo"});
  return <><AppHeader active="collection"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">STORE PAYMENTS</p><h1>店舗への支払い</h1><p>決裁権者が店舗・外部支払先への支払いを記録します。</p></div>
      <form className="year-picker"><select name="event" defaultValue={eventId} aria-label="イベント">{events.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><button>表示</button></form></div>
    {q.notice&&<div className="success-banner">{notices[q.notice]??"保存しました。"}</div>}
    {q.error&&<div className="form-banner" role="alert">{errors[q.error]??"処理に失敗しました。"}</div>}
    {!view?<div className="empty-state"><Wallet/><h2>このページは決裁権者のみ利用できます</h2></div>:<>
      <p className="collection-links"><Link href={`/collection?event=${view.event.id}`}>← 集金管理へ戻る</Link><Link href={`/remittances?event=${view.event.id}`}>送金・受領照合 →</Link></p>
      <section className="payment-summary">
        <article><ReceiptText/><span>支払予定の合計<strong>{yen(view.totals.planned)}</strong></span></article>
        <article><Banknote/><span>支払済み<strong>{yen(view.totals.paid)}</strong></span></article>
        <article className="revenue-card"><Wallet/><span>未払い<strong>{yen(view.totals.unpaid)}</strong></span></article>
      </section>
      <section className="collection-section"><h2>支払先を登録</h2>
        <form action={createStorePayment.bind(null,view.event.id)} className="expense-form">
          <label>支払先<input name="payee" required maxLength={120}/></label>
          <label>内容（任意）<input name="description" placeholder="例：会場費" maxLength={200}/></label>
          <label>支払予定額（円）<input name="plannedAmount" type="number" min="1"/></label>
          <label>支払予定日（任意）<input name="plannedDate" type="date"/></label>
          <label>既存の経費に紐づける（任意）<select name="expenseId" defaultValue=""><option value="">紐づけない（経費を新規に計上）</option>{view.linkableExpenses.map(e=><option key={e.id} value={e.id}>{e.label}（{yen(e.amount)}）</option>)}</select></label>
          <button>登録</button>
        </form>
        <p className="hint">経費の「発生」と実際の「支払」は別に管理します。経費は登録時に1回だけ計上され、支払の記録では再計上しません。既存の経費を選んだ場合は金額が自動で入ります。</p></section>
      <section className="collection-section"><h2>支払の状況</h2>
        {view.rows.map(p=><article className="advance-card" key={p.id}>
          <header><strong>{p.payee}{p.description&&`（${p.description}）`}</strong><span className={`payment-chip payment-${p.status==="PAID"?"paid":p.status==="PARTIALLY_PAID"?"pending":"unpaid"}`}>{storePaymentLabel[p.status]}</span></header>
          <dl><dt>支払予定額</dt><dd>{yen(p.plannedAmount)}（予定日 {date(p.plannedDate)}）</dd><dt>支払済み</dt><dd>{yen(p.paid)}</dd><dt>未払残高</dt><dd><strong>{yen(p.unpaid)}</strong></dd></dl>
          {p.records.map(r=><div key={r.id} className="inline-form"><small>{date(r.paidAt)}　{yen(r.amount)}（{receiptMethods[r.method]??r.method}）{r.evidenceNote&&`／証憑：${r.evidenceNote}`}{r.receiptNote&&`／領収書：${r.receiptNote}`}</small>{r.status==="VOIDED"?<span className="payment-chip payment-cancelled">取消済 {r.voidReason}</span>:<form action={voidStorePaymentRecord.bind(null,view.event.id)} className="inline-form"><input type="hidden" name="recordId" value={r.id}/><input name="reason" placeholder="取消理由" required minLength={3} maxLength={300}/><button className="line-unlink">取消</button></form>}</div>)}
          {p.unpaid>0&&<form action={recordStorePayment.bind(null,view.event.id)} className="inline-form"><input type="hidden" name="id" value={p.id}/><input name="amount" type="number" min="1" max={p.unpaid} placeholder="支払額" required/><input name="paidAt" type="date" defaultValue={today} required/><select name="method" defaultValue="BANK_TRANSFER">{Object.entries(receiptMethods).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><input name="evidenceNote" placeholder="振込証憑メモ" maxLength={300}/><input name="receiptNote" placeholder="領収書メモ" maxLength={300}/><button>支払を記録</button></form>}
        </article>)}
        {view.rows.length===0&&<div className="empty-state"><ReceiptText/><h2>支払先の登録はありません</h2></div>}
      </section></>}
  </main></>;
}
