import Link from "next/link";
import {Banknote,CircleDollarSign,HandCoins,Wallet} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {listAccessibleEvents} from "@/features/collection/access";
import {assignCollector,recordReceipt,setCollectorRole,voidReceipt} from "@/features/collection/actions";
import {getCollectionView} from "@/features/collection/data";
import {receiptMethods} from "@/features/collection/domain";
import {requireUser} from "@/server/authz";
const yen=(n:number)=>`¥${n.toLocaleString("ja-JP")}`;
const statusLabel:Record<string,string>={UNPAID:"未入金",PARTIAL:"一部入金",PAID:"入金済",OVERPAID:"過入金"};
const notices:Record<string,string>={saved:"入金を登録しました。",voided:"入金を取り消しました。",assigned:"集金担当者を更新しました。",collector_added:"集金担当者を追加しました。",collector_removed:"集金担当者を外しました。",demo:"ローカルデモでは保存されません。"};
const errors:Record<string,string>={invalid:"入力内容を確認してください。",forbidden:"この操作を行う権限がありません。",target_not_found:"対象が見つかりません。",already_paid:"すでに全額入金済みです。",overpayment:"未収金を超える金額は登録できません。",conflict:"他の操作と競合しました。もう一度お試しください。",fully_paid_lock:"全額入金済みの入金は取り消せません。入金管理で状態を変更してください。",receipt_not_found:"入金記録が見つかりません。",already_voided:"すでに取り消し済みです。",invalid_collector:"集金担当者として登録されていないユーザーです。"};
export default async function CollectionPage({searchParams}:{searchParams:Promise<{event?:string;notice?:string;error?:string}>}){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"]);
  const q=await searchParams;
  const events=await listAccessibleEvents(user);
  const eventId=events.find(e=>e.id===q.event)?.id??events[0]?.id;
  const view=eventId?await getCollectionView(user,eventId):null;
  const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Tokyo"});
  const custodyTotal=view?.custody.reduce((n,c)=>n+c.balance,0)??0;
  return <><AppHeader active="collection"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">COLLECTION</p><h1>集金管理</h1><p>担当分の請求・入金・未収金・預り金を管理します。</p></div>
      <form className="year-picker"><select name="event" defaultValue={eventId} aria-label="イベント">{events.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><button>表示</button></form></div>
    {q.notice&&<div className="success-banner">{notices[q.notice]??"保存しました。"}</div>}
    {q.error&&<div className="form-banner" role="alert">{errors[q.error]??"処理に失敗しました。"}</div>}
    {!view?<div className="empty-state"><Wallet/><h2>担当している集金イベントがありません</h2><p>イベント管理者に集金担当者として登録を依頼してください。</p></div>:<>
      <p className="collection-links"><Link href={`/advances?event=${view.event.id}`}>立替・精算を管理する →</Link>{(view.access.collector||view.access.approver)&&<Link href={`/remittances?event=${view.event.id}`}>決裁権者への送金・受領照合 →</Link>}{view.access.approver&&<Link href={`/store-payments?event=${view.event.id}`}>店舗への支払い →</Link>}</p>
      <section className="payment-summary">
        <article><Banknote/><span>請求総額<strong>{yen(view.totals.billed)}</strong></span></article>
        <article><CircleDollarSign/><span>実入金額<strong>{yen(view.totals.received)}</strong></span></article>
        <article><HandCoins/><span>未収金<strong>{yen(view.totals.unpaid)}</strong></span></article>
        <article className="revenue-card"><Wallet/><span>預り金残高<strong>{yen(custodyTotal)}</strong></span></article>
      </section>
      {view.access.manager&&<section className="collection-section"><h2>集金担当者</h2>
        <div className="collector-chips">{view.collectors.length===0&&<small>まだ登録されていません。</small>}{view.collectors.map(c=><form key={c.userId} action={setCollectorRole.bind(null,view.event.id)}><input type="hidden" name="userId" value={c.userId}/><input type="hidden" name="mode" value="remove"/><span>{c.name}</span><button className="line-unlink">外す</button></form>)}</div>
        <form action={setCollectorRole.bind(null,view.event.id)} className="inline-form"><input type="hidden" name="mode" value="add"/><select name="userId" required defaultValue=""><option value="" disabled>追加するユーザーを選択</option>{view.candidates.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button>集金担当者に追加</button></form>
      </section>}
      <section className="collection-section"><h2>入金を登録</h2>
        <form action={recordReceipt.bind(null,view.event.id)} className="expense-form">
          <label>対象<select name="target" required defaultValue=""><option value="" disabled>購入者を選択</option>{view.groups.filter(g=>g.unpaid>0).map(g=><option key={g.key} value={g.key}>{g.label}（{g.ticketCount}枚・未収{yen(g.unpaid)}）</option>)}</select></label>
          <label>金額（円）<input name="amount" type="number" min="1" inputMode="numeric" required/></label>
          <label>支払方法<select name="method" defaultValue="CASH">{Object.entries(receiptMethods).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
          <label>入金日<input name="receivedAt" type="date" defaultValue={today} required/></label>
          <label>支払者名（任意）<input name="payerName" maxLength={120}/></label>
          <label>メモ（任意）<input name="note" maxLength={300}/></label>
          <button>入金を登録</button>
        </form>
        <p className="hint">請求額に達すると、対象のチケットが自動で入金済みになりQRチケットが有効になります。</p>
      </section>
      <section className="collection-section"><h2>購入者別の請求・入金状況</h2>
        <div className="participant-table-wrap"><table className="participant-table"><thead><tr><th>購入者</th><th>枚数</th><th>担当</th><th>請求</th><th>入金</th><th>未収</th><th>状態</th>{view.access.manager&&<th>担当変更</th>}</tr></thead>
          <tbody>{view.groups.map(g=><tr key={g.key}><td><strong>{g.label}</strong><small>{g.ticketNumbers.join("・")}</small></td><td>{g.ticketCount}</td><td>{g.collectorName??"未割当"}</td><td>{yen(g.billed)}</td><td>{yen(g.received)}{g.manualPaid&&<small>入金管理で確認済み</small>}</td><td>{yen(g.unpaid)}</td><td><span className={`payment-chip payment-${g.status==="PAID"||g.status==="OVERPAID"?"paid":g.status==="PARTIAL"?"pending":"unpaid"}`}>{statusLabel[g.status]}</span></td>
            {view.access.manager&&<td><form action={assignCollector.bind(null,view.event.id)} className="inline-form"><input type="hidden" name="target" value={g.key}/><select name="collectorId" defaultValue={g.collectorId??""}><option value="">未割当</option>{view.collectors.map(c=><option key={c.userId} value={c.userId}>{c.name}</option>)}</select><button className="line-unlink">変更</button></form></td>}</tr>)}</tbody></table>
          {view.groups.length===0&&<div className="empty-state"><Wallet/><h2>対象の購入がありません</h2></div>}</div></section>
      <section className="collection-section"><h2>担当者別の預り金</h2>
        <div className="participant-table-wrap"><table className="participant-table"><thead><tr><th>集金担当者</th><th>入金合計</th><th>送金済み</th><th>うち未照合</th><th>立替の相殺</th><th>預り金残高</th></tr></thead><tbody>{view.custody.map(c=><tr key={c.collectorId}><td>{c.name}</td><td>{yen(c.received)}</td><td>{yen(c.remitted)}</td><td>{yen(c.unreconciled)}</td><td>{yen(c.offsets)}</td><td><strong>{yen(c.balance)}</strong></td></tr>)}</tbody></table></div>
        <p className="hint">預り金残高は「実入金額 − 決裁権者への送金済み額 − 預り金から支払った立替の相殺額」です。立替金・未収金とは合算しません。</p></section>
      <section className="collection-section"><h2>入金履歴</h2>
        <div className="participant-table-wrap"><table className="participant-table"><thead><tr><th>入金日</th><th>購入者</th><th>支払者</th><th>方法</th><th>金額</th><th>担当</th><th>状態</th></tr></thead>
          <tbody>{view.receipts.map(r=><tr key={r.id}><td>{r.receivedAt.toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo"})}</td><td>{r.targetLabel}</td><td>{r.payerName??"—"}{r.note&&<small>{r.note}</small>}</td><td>{receiptMethods[r.method]??r.method}</td><td>{yen(r.amount)}</td><td>{r.collectorName}</td>
            <td>{r.status==="VOIDED"?<span className="payment-chip payment-cancelled">取消済<small>{r.voidReason}</small></span>:(view.access.manager||r.collectorId===user.id)?<form action={voidReceipt.bind(null,view.event.id)} className="inline-form"><input type="hidden" name="receiptId" value={r.id}/><input name="reason" placeholder="取消理由" required minLength={3} maxLength={300}/><button className="line-unlink">取消</button></form>:"有効"}</td></tr>)}</tbody></table>
          {view.receipts.length===0&&<div className="empty-state"><CircleDollarSign/><h2>まだ入金の登録がありません</h2></div>}</div></section>
    </>}
  </main></>;
}
