import Link from "next/link";
import {BookOpen,CalendarRange,Download,Printer,Users} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {requireUser} from "@/server/authz";
import {loadBook} from "@/features/ledger/books";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;
const yen=(n:number)=>`¥${n.toLocaleString("ja-JP")}`;
const day=(d:Date)=>d.toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric"});
const time=(d:Date|null)=>d?d.toLocaleTimeString("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit"}):"—";
const payLabel:Record<string,string>={PAID:"入金済",PENDING:"入金待ち",UNPAID:"未入金"};
export default async function LedgerBooksPage({searchParams}:{searchParams:Promise<{year?:string;month?:string}>}){
  const user=await requireUser(STAFF);
  const q=await searchParams;
  const year=/^20\d{2}$/.test(q.year??"")?Number(q.year):new Date().getFullYear();
  const month=/^(?:[1-9]|1[0-2])$/.test(q.month??"")?Number(q.month):undefined;
  const book=await loadBook(user,year,month);
  const t=book.summary.totals;
  const qs=`year=${year}${month?`&month=${month}`:""}`;
  return <><AppHeader active="ledger"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">LEDGER BOOKS</p><h1>{month?`${year}年${month}月の帳簿`:`${year}年の帳簿`}</h1><p>チケットの販売記録と参加人数を、{month?"イベントごと・参加者ごとに":"月ごと・イベントごとに"}確認できます。管理者・イベント管理者・決裁権者が閲覧できます。</p></div>
      <form className="year-picker"><CalendarRange/><input name="year" type="number" min="2020" max="2100" defaultValue={year} aria-label="年"/><select name="month" defaultValue={month??""} aria-label="月"><option value="">1年間</option>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}月</option>)}</select><button>表示</button></form></div>
    <p className="collection-links"><Link href="/ledger">← イベント別の帳簿</Link><a href={`/api/ledger/books/csv?${qs}`}><Download size={14}/> CSV出力</a><Link href="/reports">報告書の作成・提出へ →</Link><span className="print-hint"><Printer size={14}/> ブラウザの印刷でPDF保存できます</span></p>
    <section className="payment-summary">
      <article><BookOpen/><span>イベント数<strong>{t.events}件</strong></span></article>
      <article><BookOpen/><span>チケット販売枚数<strong>{t.sold}枚</strong><small>うち入金済み {t.paid}枚</small></span></article>
      <article><Users/><span>参加人数（受付済み）<strong>{t.attended}名</strong></span></article>
      <article className="revenue-card"><BookOpen/><span>チケット売上（入金確認済）<strong>{yen(t.sales)}</strong></span></article>
    </section>
    {!month&&<section className="collection-section"><h2>{year}年 月別の販売記録と参加人数</h2>
      <table className="data-table"><thead><tr><th>月</th><th>イベント数</th><th>販売枚数</th><th>入金済み枚数</th><th>チケット売上</th><th>参加人数</th></tr></thead><tbody>
        {book.summary.months.map(m=><tr key={m.month}><td><Link href={`/ledger/books?year=${year}&month=${m.month}`}>{m.month}月</Link></td><td>{m.events}</td><td>{m.sold}</td><td>{m.paid}</td><td>{yen(m.sales)}</td><td>{m.attended}</td></tr>)}
        <tr><th>合計</th><th>{t.events}</th><th>{t.sold}</th><th>{t.paid}</th><th>{yen(t.sales)}</th><th>{t.attended}</th></tr>
      </tbody></table><p className="hint">月をクリックすると、その月のイベントごとの記録と参加者履歴（参加者名）を表示します。</p></section>}
    <section className="collection-section"><h2>{month?`${month}月`:`${year}年`}のイベント別 販売記録</h2>
      {book.events.length===0?<p className="hint">この期間に、帳簿を閲覧できるイベントはありません。</p>:
      <table className="data-table"><thead><tr><th>開催日</th><th>イベント</th><th>販売枚数</th><th>入金済み</th><th>チケット売上</th><th>未収金</th><th>参加人数</th></tr></thead><tbody>
        {book.events.map(e=><tr key={e.id}><td>{day(e.date)}</td><td>{e.name}</td><td>{e.tickets.sold}</td><td>{e.tickets.paid}</td><td>{yen(e.tickets.sales)}</td><td>{yen(e.tickets.receivable)}</td><td>{e.attended}</td></tr>)}
      </tbody></table>}</section>
    {month&&book.events.map(e=>{const people=book.attendees.filter(a=>a.eventId===e.id);return <section className="collection-section" key={e.id}><h2>参加者履歴：{e.name}（{day(e.date)}）</h2>
      <p className="hint">受付済み {e.attended}名 ／ チケット保有者 {people.length}名（氏名・チケット番号・入金状態・受付と退出の時刻。電話番号・メールは載せていません）</p>
      {people.length===0?<p className="hint">参加者はいません。</p>:<table className="data-table"><thead><tr><th>参加者</th><th>チケット</th><th>入金</th><th>受付</th><th>退出（理由）</th></tr></thead><tbody>
        {people.map((a,i)=><tr key={i}><td>{a.name}<small> {a.nameKana}</small></td><td><code>{a.ticketNumber}</code></td><td>{payLabel[a.paymentStatus]??a.paymentStatus}</td><td>{a.checkedInAt?time(a.checkedInAt):"未受付"}</td><td>{a.exitedAt?`${time(a.exitedAt)}（${a.exitReason}）`:"—"}</td></tr>)}
      </tbody></table>}</section>})}
  </main></>;
}
