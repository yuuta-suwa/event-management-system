"use client";
import {AlertTriangle,Camera,CheckCircle2,DoorOpen,Lock,LogIn,RefreshCw,ShieldAlert,UserCheck} from "lucide-react";
import type {CheckinResult,UnpaidResolution} from "./service";
export function CheckinResultPanel({result,busy,onNext,onResolve,onReenter,children,nextLabel="次の参加者へ"}:{result:CheckinResult|null;busy?:boolean;onNext:()=>void;onResolve:(r:UnpaidResolution)=>void;onReenter?:()=>void;children?:React.ReactNode;nextLabel?:string}){
  const kind=result?.kind;
  return <div className={`scan-result ${kind?`result-${kind.toLowerCase()}`:"result-idle"}`} role="status" aria-live="polite">
    {!result?<><Camera/><h2>受付待機中</h2><p>結果はここに大きく表示されます</p></>:<>
      {(kind==="OK"||kind==="EXIT_OK"||kind==="REENTER_OK")&&<CheckCircle2/>}{kind==="ALREADY_EXITED"&&<DoorOpen/>}{kind==="NOT_CHECKED_IN"&&<LogIn/>}{kind==="ALREADY_CHECKED_IN"&&<UserCheck/>}{kind==="UNPAID"&&<AlertTriangle/>}{kind==="LOCKED"&&<Lock/>}
      {["INVALID","WRONG_EVENT","REJECTED","FORBIDDEN","VERIFY_REQUIRED","NEEDS_ADMIN"].includes(kind??"")&&<ShieldAlert/>}
      <p className="result-label">{result.message}</p>
      <h2>{result.participantName??"確認できません"}</h2>
      {result.ticketNumber&&<code>{result.ticketNumber}</code>}
      {result.checkedInAt&&<p>{new Date(result.checkedInAt).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:"Asia/Tokyo"})} / {result.checkedInBy}</p>}
      {result.exitedAt&&<p>退出 {new Date(result.exitedAt).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:"Asia/Tokyo"})}{result.exitedBy?` / ${result.exitedBy}`:""}{result.exitReason?` / 理由：${result.exitReason}`:""}{result.exitNote?`（${result.exitNote}）`:""}</p>}
      {kind==="ALREADY_EXITED"&&onReenter&&<div className="unpaid-actions"><button disabled={busy} onClick={onReenter}>再入場として記録</button></div>}
      {children}
      {kind==="UNPAID"&&<div className="unpaid-actions"><button disabled={busy} onClick={()=>onResolve("ONSITE_PAYMENT")}>現地支払で受付</button><button disabled={busy} onClick={()=>onResolve("ADMIN_CONFIRMATION")}>管理者確認</button><button disabled={busy} onClick={()=>onResolve("REJECT")}>受付拒否</button></div>}
      <button className="scan-next" onClick={onNext}><RefreshCw/>{nextLabel}</button>
    </>}
  </div>;
}
