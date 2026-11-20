"use client";
import {useState} from "react";
import {EXIT_NOTE_MAX,EXIT_REASONS,normalizeExitReason,type ExitReason} from "./exit-domain";
import {postCheckout} from "./checkin-client";
import type {CheckinResult} from "./service";
export type ExitSetting={reason:ExitReason;note:string};
/** 読み取りの前に選んでおく「退出の理由」。選んだ理由は次の読み取りにも引き継がれる。 */
export function ExitReasonBox({value,onChange}:{value:ExitSetting;onChange:(v:ExitSetting)=>void}){
  return <div className="exit-reason-box">
    <label>退出の理由<select value={value.reason} onChange={e=>onChange({...value,reason:e.target.value as ExitReason})} aria-label="退出の理由">{(Object.entries(EXIT_REASONS) as [ExitReason,string][]).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label>メモ（任意。「その他」は必須）<input value={value.note} maxLength={EXIT_NOTE_MAX} onChange={e=>onChange({...value,note:e.target.value})} placeholder="例：子どもの迎えのため" aria-label="退出の理由メモ"/></label>
    <small>読み取ると、ここで選んだ理由で退出が記録されます。間違えたときは、結果画面から理由を直せます。</small>
  </div>;
}
/** 退出を記録した直後に、理由だけを後から直す小さなフォーム。 */
export function ExitReasonEditor({result,onUpdated}:{result:CheckinResult;onUpdated:(r:CheckinResult)=>void}){
  const [reason,setReason]=useState<ExitReason>((result.exitReasonCode as ExitReason)??"LEAVE");
  const [note,setNote]=useState(result.exitNote??"");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  if(!result.checkoutId)return null;
  async function save(){
    const check=normalizeExitReason(reason,note);
    if(!check.ok){setError(check.message);return}
    setError("");setBusy(true);
    const {result:next}=await postCheckout({op:"REASON",checkoutId:result.checkoutId!,reason,note});
    setBusy(false);
    if(next.kind==="EXIT_OK")onUpdated(next);else setError(next.message);
  }
  return <div className="exit-edit"><b>理由を直す</b>
    <select value={reason} onChange={e=>setReason(e.target.value as ExitReason)} aria-label="理由を変更">{(Object.entries(EXIT_REASONS) as [ExitReason,string][]).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
    <input value={note} maxLength={EXIT_NOTE_MAX} onChange={e=>setNote(e.target.value)} placeholder="メモ" aria-label="理由メモを変更"/>
    {error&&<span role="alert">{error}</span>}
    <button type="button" disabled={busy} onClick={()=>void save()}>理由を更新</button>
  </div>;
}
