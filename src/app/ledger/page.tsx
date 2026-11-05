import Link from "next/link";
import {BookOpen,Download,Lock,Printer} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {requireUser} from "@/server/authz";
import {db} from "@/server/db";
import {buildLedger} from "@/features/ledger/data";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;
const yen=(n:number)=>`¥${n.toLocaleString("ja-JP")}`;
const jst=(d:Date)=>d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
export default async function LedgerPage({searchParams}:{searchParams:Promise<{event?:string}>}){
  const user=await requireUser(STAFF);
  const q=await searchParams;
  // 閲覧できるのは「自分が決裁権者に指定されているイベント」だけ(SUPER_ADMINでも対象外)。
  const mine=await db.event.findMany({where:{roleAssignments:{some:{userId:user.id,role:"APPROVER",active:true}}},orderBy:{eventDate:"desc"},select:{id:true,name:true}});
  const eventId=mine.find(e=>e.id===q.event)?.id??mine[0]?.id;
  const ledger=eventId?await buildLedger(eventId):null;
  return <><AppHeader active="ledger"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">PRIVATE LEDGER</p><h1>非公開帳簿</h1><p>決裁権者本人だけが閲覧できるイベント別の収支帳簿です（SUPER_ADMINも対象外）。</p></div>
      {mine.length>0&&<form className="year-picker"><select name="event" defaultValue={eventId} aria-label="イベント">{mine.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><button>表示</button></form>}</div>
    {!ledger?<div className="empty-state"><Lock/><h2>閲覧できる帳簿がありません</h2><p>この帳簿は、イベントの決裁権者に指定された本人だけが閲覧できます。</p></div>:<>
      <p className="collection-links"><a href={`/api/ledger/csv?event=${ledger.event.id}`}><Download size={14}/> CSV出力</a><Link href={`/reports?event=${ledger.event.id}`}>報告書へ →</Link><span className="print-hint"><Printer size={14}/> ブラウザの印刷でPDF保存できます</span></p>
      <section className="payment-summary">
        <article><BookOpen/><span>チケット売上（入金確認済）<strong>{yen(ledger.tickets.sales)}</strong><small>{ledger.tickets.paidCount}/{ledger.tickets.count}枚</small></span></article>
        <article><BookOpen/><span>未収金<strong>{yen(ledger.tickets.receivable)}</strong><small>請求 {yen(ledger.tickets.billed)}／返金 {yen(ledger.tickets.refunded)}</small></span></article>
        <article><BookOpen/><span>経費<strong>{yen(ledger.expenses.total)}</strong><small>{ledger.expenses.count}件</small></span></article>
        <article className="revenue-card"><BookOpen/><span>収支（売上−経費）<strong>{yen(ledger.balance)}</strong></span></article>
      </section>
      <section className="collection-section"><h2>お金の置き場所（売上・入金・預り金は別管理）</h2>
        <dl className="ledger-dl">
          <dt>集金担当の預り金残高</dt><dd>{yen(ledger.custody.balance)}<small>（集金 {yen(ledger.custody.collected)}／送金 {yen(ledger.custody.remitted)}／立替精算への充当 {yen(ledger.custody.offsets)}）</small></dd>
          <dt>内部送金</dt><dd>受領済 {yen(ledger.remittances.reconciled)}／照合待ち {yen(ledger.remittances.unreconciled)}／送金予定 {yen(ledger.remittances.planned)}<small>（売上・経費には影響しません）</small></dd>
          <dt>参加費立替</dt><dd>立替 {yen(ledger.feeAdvances.total)}／回収済 {yen(ledger.feeAdvances.recovered)}／未回収 <strong>{yen(ledger.feeAdvances.outstanding)}</strong></dd>
          <dt>経費立替</dt><dd>立替 {yen(ledger.expenseAdvances.total)}／精算済 {yen(ledger.expenseAdvances.settled)}／未精算 <strong>{yen(ledger.expenseAdvances.unsettled)}</strong></dd>
          <dt>店舗支払</dt><dd>予定 {yen(ledger.storePayments.planned)}／支払済 {yen(ledger.storePayments.paid)}／未払金 <strong>{yen(ledger.storePayments.unpaid)}</strong></dd>
        </dl></section>
      <section className="collection-section"><h2>取引履歴</h2>
        <table className="data-table"><thead><tr><th>日時</th><th>区分</th><th>内容</th><th>金額</th><th>状態</th><th>備考・証憑</th></tr></thead><tbody>
          {ledger.entries.slice(-300).reverse().map((e,i)=><tr key={i}><td>{jst(e.at)}</td><td>{e.category}</td><td>{e.description}</td><td>{e.sign<0?"−":""}{yen(e.amount)}</td><td>{e.status}</td><td>{e.note??""}</td></tr>)}
        </tbody></table></section></>}
  </main></>;
}
