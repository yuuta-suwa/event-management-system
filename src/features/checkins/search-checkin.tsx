"use client";
import {useEffect,useState} from "react";
import {Search} from "lucide-react";
import {feedback,postCheckin} from "./checkin-client";
import {CheckinResultPanel} from "./checkin-result";
import type {Candidate,CheckinResult,UnpaidResolution,Verification} from "./service";
export function SearchCheckin({eventId}:{eventId:string}){
  const [query,setQuery]=useState("");
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [searched,setSearched]=useState(false);
  const [selected,setSelected]=useState<Candidate|null>(null);
  const [verification,setVerification]=useState<Verification>("ID_DOCUMENT");
  const [phone,setPhone]=useState("");
  const [result,setResult]=useState<CheckinResult|null>(null);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    const q=query.trim();
    if(!q)return;
    const handle=setTimeout(async()=>{
      const response=await fetch(`/api/checkins/search?eventId=${encodeURIComponent(eventId)}&q=${encodeURIComponent(q)}`,{cache:"no-store"});
      const json=await response.json().catch(()=>({candidates:[]}));
      setCandidates(json.candidates??[]);setSearched(true);
    },250);
    return()=>clearTimeout(handle);
  },[query,eventId]);
  async function confirm(resolution?:UnpaidResolution){
    if(!selected||busy)return;
    setBusy(true);
    const {result:next}=await postCheckin({method:"NAME_SEARCH",eventId,ticketId:selected.ticketId,verification,phoneLast4:verification==="PHONE_LAST4"?phone:undefined,resolution});
    setResult(next);setBusy(false);feedback(next.kind);
  }
  function reset(){setResult(null);setSelected(null);setPhone("");setQuery("");setCandidates([]);setSearched(false)}
  const homonym=(selected?.sameNameCount??1)>1;
  return <section className="scanner-layout">
    <div className="camera-panel">
      <div className="camera-title"><Search/><span>氏名・かな・チケット番号で検索</span></div>
      <form className="code-form" onSubmit={e=>e.preventDefault()}><input value={query} onChange={e=>{const v=e.target.value;setQuery(v);setSelected(null);setResult(null);if(!v.trim()){setCandidates([]);setSearched(false)}}} placeholder="例: 山田 / やまだ / EV-A001" aria-label="参加者検索" autoFocus/></form>
      <ul className="candidate-list">
        {candidates.map(c=><li key={c.ticketId}><button type="button" className={selected?.ticketId===c.ticketId?"is-selected":""} onClick={()=>{setSelected(c);setResult(null);setVerification(c.sameNameCount>1?"PHONE_LAST4":"ID_DOCUMENT")}} disabled={Boolean(c.checkedInAt)}>
          <strong>{c.name}</strong><span>{c.nameKana}</span><code>{c.ticketNumber}</code>
          <small>{c.emailMasked}{c.purchaser?` / 購入者: ${c.purchaser}`:""}{c.checkedInAt?" / 受付済み":""}{c.paymentStatus!=="PAID"?" / 未入金":""}</small>
          {c.sameNameCount>1&&<em>同姓同名 {c.sameNameCount}名 — 本人確認を厳格に</em>}
        </button></li>)}
        {searched&&candidates.length===0&&<li className="candidate-empty">該当する参加者がいません</li>}
      </ul>
      {selected&&!result&&<div className="verify-box">
        <p><b>{selected.name}</b>（{selected.ticketNumber}）を受付します。本人確認の方法を選んでください。</p>
        <label><input type="radio" name="verify" checked={verification==="ID_DOCUMENT"} onChange={()=>setVerification("ID_DOCUMENT")}/>身分証・チケット番号を確認した</label>
        <label><input type="radio" name="verify" checked={verification==="PHONE_LAST4"} onChange={()=>setVerification("PHONE_LAST4")}/>電話番号の下4桁を本人に言ってもらう</label>
        {verification==="PHONE_LAST4"&&<input className="phone-input" inputMode="numeric" maxLength={4} value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,""))} placeholder="下4桁"/>}
        <label className={homonym?"is-disabled":""}><input type="radio" name="verify" disabled={homonym} checked={verification==="SELF_DECLARED"} onChange={()=>setVerification("SELF_DECLARED")}/>本人の申告のみ{homonym?"（同姓同名のため選べません）":""}</label>
        <button className="verify-confirm" disabled={busy||(verification==="PHONE_LAST4"&&phone.length!==4)} onClick={()=>void confirm()}>受付を確定する</button>
      </div>}
    </div>
    <CheckinResultPanel result={result} busy={busy} onNext={reset} onResolve={r=>void confirm(r)} nextLabel="次の参加者を検索"/>
  </section>;
}
