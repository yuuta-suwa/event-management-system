import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {AppHeader} from "@/components/app-header";
import {requireUser} from "@/server/authz";
import {db} from "@/server/db";
import {ledgerAccess} from "@/features/ledger/access";
import {loadEditTarget,listRevisions} from "@/features/ledger/edit-data";
import {describeChange,EDIT_TYPE_LABEL,isEditType,REASON_MAX,snapshotOf,statusLabel} from "@/features/ledger/edit-domain";
import {editLedgerEntry} from "@/features/ledger/edit-actions";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;
const yen=(n:number)=>`¥${n.toLocaleString("ja-JP")}`;
const jst=(d:Date)=>d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
const errors:Record<string,string>={
  reason_required:"編集の理由を入力してください。",reason_too_long:`編集の理由は${REASON_MAX}文字以内にしてください。`,
  invalid:"入力内容を確認してください（必須項目・金額・日付）。",no_change:"変更がありません。直した内容を入力してください。",
  stale:"他の人が先にこの記録を直しました。最新の内容を読み込み直したので、もう一度確認して保存してください。",
  below_recovered:"回収済みの金額より小さい立替額には直せません。",below_settled:"精算済みの金額より小さい立替額には直せません。",
  forbidden:"この記録を編集する権限がありません。",not_found:"この記録は編集できません（取消済み、または見つかりません）。",conflict:"他の操作と競合しました。もう一度お試しください。",
};
export default async function LedgerEditPage({searchParams}:{searchParams:Promise<{type?:string;id?:string;error?:string}>}){
  const user=await requireUser(STAFF);
  const q=await searchParams;
  if(!isEditType(q.type)||!q.id)notFound();
  const target=await loadEditTarget(db,q.type,q.id);
  if(!target)notFound();
  if(!await ledgerAccess(user,target.eventId))redirect("/ledger");
  const history=await listRevisions(db,target.eventId,{entityType:target.type,entityId:target.id,take:50});
  const back=`/ledger?event=${target.eventId}`;
  return <><AppHeader active="ledger"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">LEDGER EDIT</p><h1>帳簿の記録を編集</h1><p>{target.eventName} ／ {EDIT_TYPE_LABEL[target.type]}：{target.title}</p></div><Link className="secondary-link" href={back}>← 帳簿に戻る</Link></div>
    {q.error&&<div className="form-banner" role="alert">{errors[q.error]??"保存できませんでした。"}</div>}
    <section className="collection-section"><h2>内容を直す</h2>
      <p className="ledger-note">直した内容は「編集履歴」に、直した人・日時・理由・変更前後が残り、消せません。理由は必ず入力してください。</p>
      {target.linked&&<p className="ledger-note">この経費は立替・店舗支払から作られているため、金額と項目名は元の記録（立替・精算／店舗支払）を直してください。ここでは備考のみ直せます。</p>}
      {target.paidSoFar>0&&<p className="ledger-note">{target.type==="FeeAdvance"?"回収済み":"精算済み"} {yen(target.paidSoFar)} があるため、立替額はこの金額以上にしてください。{target.status&&<>（現在の状態：{statusLabel(target.type,target.status)}）</>}</p>}
      <form action={editLedgerEntry} className="ledger-edit-form">
        <input type="hidden" name="type" value={target.type}/><input type="hidden" name="id" value={target.id}/><input type="hidden" name="snapshot" value={snapshotOf(target.values)}/>
        {target.fields.map(f=><label key={f.key} className={f.long?"wide":undefined}>{f.label}{f.required?"":"（任意）"}
          {f.kind==="int"?<input name={f.key} type="number" inputMode="numeric" step="1" min={Math.max(f.min??0,target.paidSoFar)} max={f.max} defaultValue={target.values[f.key]??""} required={f.required}/>
          :f.kind==="date"?<input name={f.key} type="date" defaultValue={String(target.values[f.key]??"")} required={f.required}/>
          :f.long?<textarea name={f.key} rows={2} maxLength={f.max} defaultValue={String(target.values[f.key]??"")}/>
          :<input name={f.key} maxLength={f.max} defaultValue={String(target.values[f.key]??"")} required={f.required}/>}</label>)}
        <label className="wide"><strong>編集の理由（必須）</strong>
          <textarea name="reason" rows={3} maxLength={REASON_MAX} required placeholder="例: 領収書の金額に合わせて訂正／入力ミスの修正"/></label>
        <div className="ledger-edit-actions"><button>理由つきで保存</button><Link href={back}>キャンセル</Link></div>
      </form></section>
    <section className="collection-section"><h2>この記録の編集履歴</h2>
      {history.length===0?<p className="ledger-note">まだ編集されていません。</p>:<table className="data-table"><thead><tr><th>日時</th><th>編集者</th><th>変更内容</th><th>理由</th></tr></thead><tbody>
        {history.map(h=><tr key={h.id}><td>{jst(h.at)}</td><td>{h.editor}</td><td>{h.changes.map((c,i)=><div key={i}>{describeChange(h.type,c)}</div>)}</td><td>{h.reason}</td></tr>)}
      </tbody></table>}</section>
  </main></>;
}
