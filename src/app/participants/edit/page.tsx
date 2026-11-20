import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {AppHeader} from "@/components/app-header";
import {requireUser} from "@/server/authz";
import {db} from "@/server/db";
import {canManageRoster} from "@/features/roster/backfill-service";
import {listRosterHistory,loadRosterTarget} from "@/features/roster/edit-service";
import {ATTENDANCE_LABEL,describeRosterChange,GENDER_LABEL,PAYMENT_VALUE_LABEL,REASON_MAX,snapshotOf} from "@/features/roster/edit-domain";
import {PAY_METHOD_LABEL} from "@/features/roster/backfill-domain";
import {editRosterEntry} from "@/features/roster/edit-actions";
const jst=(d:Date)=>d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
const errors:Record<string,string>={
  reason_required:"編集の理由を入力してください。",reason_too_long:`編集の理由は${REASON_MAX}文字以内にしてください。`,
  invalid:"入力内容を確認してください（名前・電話・メール・日付・金額）。",no_change:"変更がありません。直した内容を入力してください。",
  stale:"他の人が先にこの記録を直しました。最新の内容を読み込み直したので、もう一度確認して保存してください。",
  record_locked:"このチケットは取消・返金済みなどのため、入金・出欠は直せません（名前・連絡先は直せます）。",
  unpay_not_supported:"入金済みを未入金に戻す操作はここではできません。返金・取消は入金の画面から行ってください。",
  exit_records:"退出の記録があるため、受付を取り消せません。",
  forbidden:"この記録を編集する権限がありません。",not_found:"この記録は見つかりません。",conflict:"他の操作と競合しました。もう一度お試しください。",
};
export default async function RosterEditPage({searchParams}:{searchParams:Promise<{registration?:string;error?:string}>}){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const q=await searchParams;
  if(!q.registration)notFound();
  const t=await loadRosterTarget(db,q.registration);
  if(!t)notFound();
  if(!canManageRoster(user,{managerId:t.managerId}))redirect("/participants");
  const history=await listRosterHistory(db,t);
  const v=t.values,s=(k:string)=>v[k]===null||v[k]===undefined?"":String(v[k]);
  const locked=Boolean(t.recordLockedReason);
  const back=`/participants?event=${t.eventId}`;
  return <><AppHeader active="participants"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">ROSTER EDIT</p><h1>参加者の記録を編集</h1><p>{t.eventName} ／ {s("name")}</p></div><Link className="secondary-link" href={back}>← 参加者名簿に戻る</Link></div>
    {q.error&&<div className="form-banner" role="alert">{errors[q.error]??"保存できませんでした。"}</div>}
    <form action={editRosterEntry} className="ledger-edit-form roster-edit-form">
      <input type="hidden" name="registrationId" value={t.registrationId}/><input type="hidden" name="snapshot" value={snapshotOf(v)}/>
      <h2 className="wide">参加者の情報</h2>
      <p className="ledger-note wide">名前・連絡先などは同じ人の<strong>ほかのイベントの記録にも</strong>反映されます。電話・メールは空欄でも構いません（空欄だとメールは届きません）。</p>
      <label>名前<input name="name" required maxLength={100} defaultValue={s("name")}/></label>
      <label>フリガナ<input name="nameKana" maxLength={120} defaultValue={s("nameKana")}/></label>
      <label>電話<input name="phone" type="tel" maxLength={24} defaultValue={s("phone")}/></label>
      <label>メール<input name="email" type="email" defaultValue={s("email")}/></label>
      <label>性別<select name="gender" defaultValue={s("gender")}>{Object.entries(GENDER_LABEL).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
      <label>年齢<input name="age" inputMode="numeric" defaultValue={s("age")}/></label>
      <label>職業<input name="occupation" maxLength={120} defaultValue={s("occupation")}/></label>
      <label>紹介者（自由記入）<input name="referrerName" maxLength={100} defaultValue={s("referrerName")}/></label>
      <label>SNS<input name="snsContact" maxLength={200} defaultValue={s("snsContact")}/></label>
      <label className="wide">備考<textarea name="notes" rows={2} maxLength={1000} defaultValue={s("notes")}/></label>

      <h2 className="wide">このイベントでの入金・出欠</h2>
      {locked?<p className="ledger-note wide">{t.recordLockedReason}</p>:<p className="ledger-note wide">変更しても、メールやLINEの通知は送りません。入金済みを未入金に戻す操作はできません（返金・取消は入金の画面から）。</p>}
      <fieldset disabled={locked} className="roster-fieldset wide">
        <label>入金<select name="payment" defaultValue={s("payment")}>{Object.entries(PAYMENT_VALUE_LABEL).map(([k,l])=><option key={k} value={k} disabled={k==="UNPAID"&&v.payment==="PAID"}>{l}</option>)}</select></label>
        <label>入金額（空欄＝参加費 ¥{t.eventPrice.toLocaleString("ja-JP")}）<input name="amount" inputMode="numeric" defaultValue={s("amount")}/></label>
        <label>入金日（空欄＝開催日）<input name="paidAt" type="date" defaultValue={s("paidAt")}/></label>
        <label>入金方法<select name="method" defaultValue={s("method")}><option value="">（未設定・銀行振込）</option>{Object.entries(PAY_METHOD_LABEL).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
        <label>出欠<select name="attendance" defaultValue={s("attendance")}>{Object.entries(ATTENDANCE_LABEL).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
        <label>受付日時（空欄＝開始時刻）<input name="checkedInAt" type="datetime-local" defaultValue={s("checkedInAt")}/></label>
      </fieldset>

      <label className="wide"><strong>編集の理由（必須）</strong><textarea name="reason" rows={3} maxLength={REASON_MAX} required placeholder="例: 1月分の記録を追加入力／電話番号の入力ミスを訂正"/></label>
      <div className="ledger-edit-actions"><button>理由つきで保存</button><Link href={back}>キャンセル</Link></div>
    </form>
    <section className="collection-section"><h2>この記録の編集履歴</h2>
      {history.length===0?<p className="ledger-note">まだ編集されていません。</p>:<table className="data-table"><thead><tr><th>日時</th><th>操作した人</th><th>内容</th><th>理由</th></tr></thead><tbody>
        {history.map(h=><tr key={h.id}><td>{jst(h.at)}</td><td>{h.editor??"—"}</td><td>{h.kind==="BACKFILL"?"過去の記録として入力":h.changes.map((c,i)=><div key={i}>{describeRosterChange(c)}</div>)}</td><td>{h.reason||"—"}</td></tr>)}
      </tbody></table>}</section>
  </main></>;
}
