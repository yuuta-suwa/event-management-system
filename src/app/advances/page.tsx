import Link from "next/link";
import {HandCoins,ReceiptText,Wallet} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {listAccessibleEvents} from "@/features/collection/access";
import {cancelExpenseAdvance,cancelFeeAdvance,decideExpenseAdvance,recordExpenseSettlement,recordFeeAdvance,recordFeeRecovery,requestExpenseAdvance,resubmitExpenseAdvance} from "@/features/collection/advance-actions";
import {getAdvancesView} from "@/features/collection/data";
import {expenseStatusLabel,receiptMethods,type ExpenseAdvanceStatus} from "@/features/collection/domain";
import {requireUser} from "@/server/authz";
const yen=(n:number)=>`¥${n.toLocaleString("ja-JP")}`;
const feeLabel:Record<string,string>={OPEN:"未回収",PARTIALLY_RECOVERED:"一部回収",RECOVERED:"回収済み",CANCELLED:"取消"};
const notices:Record<string,string>={fee_saved:"参加費立替を登録しました。",recovery_saved:"回収を登録しました。",fee_cancelled:"参加費立替を取り消しました。",expense_requested:"経費立替を申請しました。",expense_reviewing:"確認中にしました。",expense_approved:"承認しました。経費に計上されました。",expense_returned:"差し戻しました。",expense_cancelled:"申請を取り消しました。",expense_resubmitted:"修正して再申請しました。",settlement_saved:"精算を登録しました。",demo:"ローカルデモでは保存されません。"};
const errors:Record<string,string>={invalid:"入力内容を確認してください。",forbidden:"この操作を行う権限がありません。",not_found:"対象が見つかりません。",invalid_transition:"現在の状態ではこの操作はできません。",exceeds_balance:"残高を超える金額は登録できません。",has_records:"回収の記録があるため取り消せません。",target_not_found:"対象が見つかりません。",self_approval:"ご自身の申請は承認できません。別の決裁権者が操作してください。",reason_required:"差戻しの理由を入力してください。",conflict:"他の操作と競合しました。もう一度お試しください。"};
const chip=(s:string)=>s==="SETTLED"||s==="RECOVERED"?"paid":s==="CANCELLED"||s==="RETURNED"?"cancelled":s==="REQUESTED"||s==="REVIEWING"||s==="OPEN"?"unpaid":"pending";
export default async function AdvancesPage({searchParams}:{searchParams:Promise<{event?:string;notice?:string;error?:string}>}){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"]);
  const q=await searchParams;
  const events=await listAccessibleEvents(user);
  const eventId=events.find(e=>e.id===q.event)?.id??events[0]?.id;
  const view=eventId?await getAdvancesView(user,eventId):null;
  const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Tokyo"});
  const canRequest=Boolean(view&&(view.access.manager||view.access.collector));
  return <><AppHeader active="collection"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">ADVANCES</p><h1>立替・精算</h1><p>参加費の立替と、イベント経費の立替・精算を管理します。</p></div>
      <form className="year-picker"><select name="event" defaultValue={eventId} aria-label="イベント">{events.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><button>表示</button></form></div>
    {q.notice&&<div className="success-banner">{notices[q.notice]??"保存しました。"}</div>}
    {q.error&&<div className="form-banner" role="alert">{errors[q.error]??"処理に失敗しました。"}</div>}
    {!view?<div className="empty-state"><Wallet/><h2>担当しているイベントがありません</h2></div>:<>
      <p className="collection-links"><Link href={`/collection?event=${view.event.id}`}>← 集金管理へ戻る</Link></p>
      <section className="payment-summary">
        <article><HandCoins/><span>参加費立替の未回収<strong>{yen(view.totals.feeOutstanding)}</strong></span></article>
        <article><ReceiptText/><span>承認済みの経費立替<strong>{yen(view.totals.expenseApproved)}</strong></span></article>
        <article className="revenue-card"><Wallet/><span>経費立替の未精算<strong>{yen(view.totals.expenseUnsettled)}</strong></span></article>
      </section>

      <section className="collection-section"><h2>A. 参加費立替（参加者のチケット代を他の人が立て替えた場合）</h2>
        {canRequest&&<form action={recordFeeAdvance.bind(null,view.event.id)} className="expense-form">
          <label>本来の支払義務者<input name="obligorName" required maxLength={120}/></label>
          <label>立替者<input name="advancerName" required maxLength={120}/></label>
          <label>対象の購入（任意）<select name="target" defaultValue=""><option value="">指定しない</option>{view.targets.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
          <label>立替金額（円）<input name="amount" type="number" min="1" required/></label>
          <label>立替日<input name="advancedAt" type="date" defaultValue={today} required/></label>
          <label>支払方法<select name="method" defaultValue="CASH">{Object.entries(receiptMethods).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
          <label>証憑メモ（任意）<input name="evidenceNote" maxLength={300}/></label>
          <button>立替を登録</button>
        </form>}
        <p className="hint">参加者からの回収状況と、イベント側の代金受領（集金管理の入金）は別々に管理されます。</p>
        {view.feeAdvances.map(f=><article className="advance-card" key={f.id}>
          <header><strong>{f.obligorName} の参加費（立替：{f.advancerName}）</strong><span className={`payment-chip payment-${chip(f.status)}`}>{feeLabel[f.status]??f.status}</span></header>
          <dl><dt>立替金額</dt><dd>{yen(f.amount)}（{f.advancedAt.toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo"})}）</dd><dt>回収済み</dt><dd>{yen(f.recovered)}</dd><dt>未回収残高</dt><dd><strong>{yen(f.outstanding)}</strong></dd>{f.evidenceNote&&<><dt>証憑メモ</dt><dd>{f.evidenceNote}</dd></>}</dl>
          {f.recoveries.length>0&&<small>回収履歴：{f.recoveries.map(r=>`${r.recoveredAt.toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric"})} ${yen(r.amount)}`).join(" / ")}</small>}
          {canRequest&&f.outstanding>0&&<form action={recordFeeRecovery.bind(null,view.event.id)} className="inline-form"><input type="hidden" name="feeAdvanceId" value={f.id}/><input name="amount" type="number" min="1" max={f.outstanding} placeholder="回収額" required/><input name="recoveredAt" type="date" defaultValue={today} required/><select name="method" defaultValue="CASH">{Object.entries(receiptMethods).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><button>回収を登録</button></form>}
          {canRequest&&f.status==="OPEN"&&<form action={cancelFeeAdvance.bind(null,view.event.id)}><input type="hidden" name="feeAdvanceId" value={f.id}/><button className="line-unlink">この立替を取り消す</button></form>}
        </article>)}
        {view.feeAdvances.length===0&&<div className="empty-state"><HandCoins/><h2>参加費立替の記録はありません</h2></div>}
      </section>

      <section className="collection-section"><h2>B. イベント経費立替（店舗代・備品代などを個人が負担した場合）</h2>
        {canRequest&&<form action={requestExpenseAdvance.bind(null,view.event.id)} className="expense-form">
          <label>立替者<input name="advancerName" required maxLength={120}/></label>
          <label>費目<input name="category" placeholder="例：会場費" required maxLength={60}/></label>
          <label>支払先<input name="payee" required maxLength={120}/></label>
          <label>金額（円）<input name="amount" type="number" min="1" required/></label>
          <label>支払日<input name="paidAt" type="date" defaultValue={today} required/></label>
          <label>領収書メモ（任意）<input name="evidenceNote" maxLength={300}/></label>
          <button>精算を申請</button>
        </form>}
        <p className="hint">承認されると経費として1回だけ計上されます。精算（立替者への返済）では経費を再計上しません。</p>
        {view.expenseAdvances.map(e=>{const st=e.status as ExpenseAdvanceStatus;const mine=e.requestedBy===user.id;const open=st==="REQUESTED"||st==="REVIEWING";
          return <article className="advance-card" key={e.id}>
            <header><strong>{e.category}（立替：{e.advancerName}）</strong><span className={`payment-chip payment-${chip(st)}`}>{expenseStatusLabel[st]}</span></header>
            <dl><dt>支払先</dt><dd>{e.payee}（{e.paidAt.toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo"})}）</dd><dt>金額</dt><dd>{yen(e.amount)}</dd><dt>精算済み</dt><dd>{yen(e.settled)}</dd><dt>未精算</dt><dd><strong>{yen(e.unsettled)}</strong></dd>{e.evidenceNote&&<><dt>領収書メモ</dt><dd>{e.evidenceNote}</dd></>}{st==="RETURNED"&&e.returnReason&&<><dt>差戻し理由</dt><dd>{e.returnReason}</dd></>}</dl>
            {e.settlements.length>0&&<small>精算履歴：{e.settlements.map(s=>`${s.settledAt.toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric"})} ${yen(s.amount)}`).join(" / ")}</small>}
            {view.access.approver&&open&&!mine&&<div className="advance-actions">
              {st==="REQUESTED"&&<form action={decideExpenseAdvance.bind(null,view.event.id)}><input type="hidden" name="id" value={e.id}/><input type="hidden" name="decision" value="review"/><button className="line-unlink">確認を開始</button></form>}
              <form action={decideExpenseAdvance.bind(null,view.event.id)}><input type="hidden" name="id" value={e.id}/><input type="hidden" name="decision" value="approve"/><button className="line-unlink">承認する</button></form>
              <form action={decideExpenseAdvance.bind(null,view.event.id)} className="inline-form"><input type="hidden" name="id" value={e.id}/><input type="hidden" name="decision" value="return"/><input name="reason" placeholder="差戻し理由" required maxLength={300}/><button className="line-unlink">差し戻す</button></form></div>}
            {view.access.approver&&(st==="APPROVED"||st==="PARTIALLY_SETTLED")&&<form action={recordExpenseSettlement.bind(null,view.event.id)} className="inline-form"><input type="hidden" name="id" value={e.id}/><input name="amount" type="number" min="1" max={e.unsettled} placeholder="精算額" required/><input name="settledAt" type="date" defaultValue={today} required/><select name="method" defaultValue="BANK_TRANSFER">{Object.entries(receiptMethods).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><button>精算を登録</button></form>}
            {(mine||view.access.manager)&&st==="RETURNED"&&<form action={resubmitExpenseAdvance.bind(null,view.event.id)} className="inline-form"><input type="hidden" name="id" value={e.id}/><input name="advancerName" defaultValue={e.advancerName} required/><input name="category" defaultValue={e.category} required/><input name="payee" defaultValue={e.payee} required/><input name="amount" type="number" min="1" defaultValue={e.amount} required/><input name="paidAt" type="date" defaultValue={e.paidAt.toLocaleDateString("sv-SE",{timeZone:"Asia/Tokyo"})} required/><input name="evidenceNote" defaultValue={e.evidenceNote??""} placeholder="領収書メモ"/><button>修正して再申請</button></form>}
            {(mine||view.access.manager)&&(open||st==="RETURNED")&&<form action={cancelExpenseAdvance.bind(null,view.event.id)}><input type="hidden" name="id" value={e.id}/><button className="line-unlink">申請を取り消す</button></form>}
          </article>})}
        {view.expenseAdvances.length===0&&<div className="empty-state"><ReceiptText/><h2>経費立替の申請はありません</h2></div>}
      </section></>}
  </main></>;
}
