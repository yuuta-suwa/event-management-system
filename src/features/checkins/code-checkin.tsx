"use client";
import {useRef,useState} from "react";
import {Hash} from "lucide-react";
import {feedback,postCheckin,postCheckout} from "./checkin-client";
import {ExitReasonEditor,type ExitSetting} from "./exit-controls";
import {CheckinResultPanel} from "./checkin-result";
import type {CheckinResult,UnpaidResolution} from "./service";
export function CodeCheckin({eventId,exit}:{eventId:string;exit?:ExitSetting}){
  const [code,setCode]=useState("");
  const [result,setResult]=useState<CheckinResult|null>(null);
  const [busy,setBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  async function submit(value:string,resolution?:UnpaidResolution){
    if(busy)return;
    setBusy(true);
    const {result:next}=exit?await postCheckout({op:"EXIT",method:"RECEPTION_CODE",eventId,code:value,reason:exit.reason,note:exit.note}):await postCheckin({method:"RECEPTION_CODE",eventId,code:value,resolution});
    setResult(next);setBusy(false);feedback(next.kind);
  }
  function reset(){setResult(null);setCode("");input.current?.focus()}
  return <section className="scanner-layout">
    <div className="camera-panel">
      <div className="camera-title"><Hash/><span>{exit?"退出する方の6桁の受付コードを入力してください":"参加者の6桁の受付コードを入力してください"}</span></div>
      <form className="code-form" onSubmit={e=>{e.preventDefault();void submit(code)}}>
        <input ref={input} autoFocus inputMode="numeric" autoComplete="off" pattern="[0-9 ]*" maxLength={7} value={code} aria-label="受付コード"
          onChange={e=>{const v=e.target.value.replace(/[^0-9]/g,"").slice(0,6);setCode(v);if(v.length===6)void submit(v)}} placeholder="000000"/>
        <button disabled={busy||code.replace(/\D/g,"").length!==6}>{exit?"退出を記録":"受付する"}</button>
      </form>
      <p className="scan-hint">マイチケット画面・メールに表示される6桁の数字です。誤入力が続くと一時的に入力できなくなります。</p>
    </div>
    <CheckinResultPanel result={result} busy={busy} onNext={reset} onResolve={r=>void submit(code,r)} onReenter={result?.ticketId?()=>{setBusy(true);void postCheckout({op:"REENTER",ticketId:result.ticketId!,eventId}).then(({result:next})=>{setResult(next);setBusy(false);feedback(next.kind)})}:undefined} nextLabel="次の参加者へ">
      {result?.kind==="EXIT_OK"&&<ExitReasonEditor result={result} onUpdated={setResult}/>}
    </CheckinResultPanel>
  </section>;
}
