"use client";
import {useRef,useState} from "react";
import {Hash} from "lucide-react";
import {feedback,postCheckin} from "./checkin-client";
import {CheckinResultPanel} from "./checkin-result";
import type {CheckinResult,UnpaidResolution} from "./service";
export function CodeCheckin({eventId}:{eventId:string}){
  const [code,setCode]=useState("");
  const [result,setResult]=useState<CheckinResult|null>(null);
  const [busy,setBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  async function submit(value:string,resolution?:UnpaidResolution){
    if(busy)return;
    setBusy(true);
    const {result:next}=await postCheckin({method:"RECEPTION_CODE",eventId,code:value,resolution});
    setResult(next);setBusy(false);feedback(next.kind);
  }
  function reset(){setResult(null);setCode("");input.current?.focus()}
  return <section className="scanner-layout">
    <div className="camera-panel">
      <div className="camera-title"><Hash/><span>参加者の6桁の受付コードを入力してください</span></div>
      <form className="code-form" onSubmit={e=>{e.preventDefault();void submit(code)}}>
        <input ref={input} autoFocus inputMode="numeric" autoComplete="off" pattern="[0-9 ]*" maxLength={7} value={code} aria-label="受付コード"
          onChange={e=>{const v=e.target.value.replace(/[^0-9]/g,"").slice(0,6);setCode(v);if(v.length===6)void submit(v)}} placeholder="000000"/>
        <button disabled={busy||code.replace(/\D/g,"").length!==6}>受付する</button>
      </form>
      <p className="scan-hint">マイチケット画面・メールに表示される6桁の数字です。誤入力が続くと一時的に入力できなくなります。</p>
    </div>
    <CheckinResultPanel result={result} busy={busy} onNext={reset} onResolve={r=>void submit(code,r)} nextLabel="次の参加者へ"/>
  </section>;
}
