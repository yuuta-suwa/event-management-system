"use client";
import {useActionState,useEffect,useState} from "react";
import {registerParticipant} from "./actions";

const FIELDS=["name","nameKana","phone","email","quantity","gender","age","occupation","referrerName","snsContact","notes"] as const;
type Field=(typeof FIELDS)[number];
type Values=Record<Field,string>;
const EMPTY:Values={name:"",nameKana:"",phone:"",email:"",quantity:"1",gender:"",age:"",occupation:"",referrerName:"",snsContact:"",notes:""};
const PREFIX="apply-draft:";
const draftKey=(eventId:string)=>`${PREFIX}${eventId}`;
function loadDraft(eventId:string):Values|null{
  try{const raw=window.localStorage.getItem(draftKey(eventId));if(!raw)return null;const o=JSON.parse(raw) as Partial<Values>;return {...EMPTY,...Object.fromEntries(FIELDS.map(k=>[k,typeof o[k]==="string"?o[k]:EMPTY[k]]))} as Values}catch{return null}
}
function saveDraft(eventId:string,v:Values){try{window.localStorage.setItem(draftKey(eventId),JSON.stringify(v))}catch{/* 保存できない環境では何もしない */}}
/** 申込が完了したら、この端末に一時保存していた入力内容を消す。 */
export function ClearApplyDraft(){
  useEffect(()=>{try{const ls=window.localStorage;for(let i=ls.length-1;i>=0;i--){const k=ls.key(i);if(k?.startsWith(PREFIX))ls.removeItem(k)}}catch{/* noop */}},[]);
  return null;
}

export function RegistrationForm({eventId,referralCode}:{eventId:string;referralCode:string|null}){
  const[state,action,pending]=useActionState(registerParticipant,{});
  const[v,setV]=useState<Values>(EMPTY);
  const[restored,setRestored]=useState(false);
  const[hydrated,setHydrated]=useState(false);
  // 入力内容は、エラーになっても・ページを閉じても・再読み込みしても残す(この端末のブラウザにだけ一時保存。申込完了で削除)。
  useEffect(()=>{
    const d=loadDraft(eventId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 保存済みの下書きを読み込むため、マウント後に1回だけ状態へ反映する
    if(d){setV(d);setRestored(FIELDS.some(k=>d[k]!==EMPTY[k]))}
    setHydrated(true);
  },[eventId]);
  useEffect(()=>{if(hydrated)saveDraft(eventId,v)},[eventId,v,hydrated]);
  // サーバーがエラーを返したときは、送信した内容で入力欄を復元する(フォームの自動リセットで消えないように)。
  useEffect(()=>{
    const s=state.values;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- サーバーから返った入力値で入力欄を復元する
    if(s)setV(prev=>({...prev,...Object.fromEntries(FIELDS.map(k=>[k,s[k]??prev[k]]))} as Values));
  },[state]);
  const set=(k:Field)=>(e:{target:{value:string}})=>setV(p=>({...p,[k]:e.target.value}));
  const err=(n:string)=>state.errors?.[n]?.[0];
  return <form action={action} className="public-form">
    <input type="hidden" name="eventId" value={eventId}/>
    {referralCode&&<input type="hidden" name="referralCode" value={referralCode}/>}
    {state.message&&<div className="form-banner" role="alert">{state.message}</div>}
    {restored&&!state.message&&<div className="success-banner">前回の入力内容を復元しました。内容をご確認のうえ、お申し込みください。</div>}
    <div className="public-form-grid">
      <label>氏名<span>必須</span><input name="name" autoComplete="name" required value={v.name} onChange={set("name")}/>{err("name")&&<small>{err("name")}</small>}</label>
      <label>フリガナ<span>必須</span><input name="nameKana" required value={v.nameKana} onChange={set("nameKana")}/>{err("nameKana")&&<small>{err("nameKana")}</small>}</label>
      <label>電話番号<span>必須</span><input name="phone" type="tel" autoComplete="tel" required value={v.phone} onChange={set("phone")}/>{err("phone")&&<small>{err("phone")}</small>}</label>
      <label>枚数<input name="quantity" type="number" min="1" max="10" value={v.quantity} onChange={set("quantity")}/><small>2枚以上を選ぶと、あなたの分を除いた残りをマイページから配布できます。</small>{err("quantity")&&<small>{err("quantity")}</small>}</label>
      <label>メールアドレス<span>必須</span><input name="email" type="email" autoComplete="email" required value={v.email} onChange={set("email")}/>{err("email")&&<small>{err("email")}</small>}</label>
      <label>性別<select name="gender" value={v.gender} onChange={set("gender")}><option value="">回答しない</option><option value="MALE">男性</option><option value="FEMALE">女性</option><option value="OTHER">その他</option></select></label>
      <label>年齢<input name="age" type="number" min="0" max="120" value={v.age} onChange={set("age")}/></label>
      <label className="span-2">職種<input name="occupation" value={v.occupation} onChange={set("occupation")}/></label>
      <label>紹介者名<input name="referrerName" placeholder="どなたからのご紹介ですか？" value={v.referrerName} onChange={set("referrerName")}/></label>
      <label>その他の連絡先<input name="snsContact" placeholder="LINE ID・Instagram IDなど" value={v.snsContact} onChange={set("snsContact")}/></label>
      <label className="span-2">備考<textarea name="notes" rows={3} value={v.notes} onChange={set("notes")}/></label>
    </div>
    <label className="privacy-check"><input type="checkbox" name="privacy" required/><span>個人情報の取扱いとキャンセル規定に同意します</span></label>
    <button disabled={pending}>{pending?"申し込み中…":"参加を申し込む"}</button>
    <p className="hint">入力内容は、この端末のブラウザに一時保存されます（申込完了後に自動で削除されます）。</p>
  </form>
}
