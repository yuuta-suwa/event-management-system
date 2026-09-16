"use client";
import {useActionState} from "react";
import {updateMyDetails} from "./self-service-actions";
export function MyDetailsForm({token,participant,disabled}:{token:string;participant:{name:string;nameKana:string;phone:string;email:string;gender:string|null;age:number|null;occupation:string|null;notes:string|null};disabled:boolean}){
  const [state,action,pending]=useActionState(updateMyDetails,{});
  const err=(n:string)=>state.errors?.[n]?.[0];
  return <form action={action} className="public-form">
    <input type="hidden" name="token" value={token}/>
    {state.message&&<div className="form-banner">{state.message}</div>}
    <div className="public-form-grid">
      <label>氏名<span>必須</span><input name="name" defaultValue={participant.name} disabled={disabled} required/>{err("name")&&<small>{err("name")}</small>}</label>
      <label>フリガナ<span>必須</span><input name="nameKana" defaultValue={participant.nameKana} disabled={disabled} required/>{err("nameKana")&&<small>{err("nameKana")}</small>}</label>
      <label>電話番号<span>必須</span><input name="phone" type="tel" defaultValue={participant.phone} disabled={disabled} required/>{err("phone")&&<small>{err("phone")}</small>}</label>
      <label>メールアドレス<span>必須</span><input name="email" type="email" defaultValue={participant.email} disabled={disabled} required/>{err("email")&&<small>{err("email")}</small>}</label>
      <label>性別<select name="gender" defaultValue={participant.gender??""} disabled={disabled}><option value="">回答しない</option><option value="MALE">男性</option><option value="FEMALE">女性</option><option value="OTHER">その他</option></select></label>
      <label>年齢<input name="age" type="number" min="0" max="120" defaultValue={participant.age??""} disabled={disabled}/></label>
      <label className="span-2">職種<input name="occupation" defaultValue={participant.occupation??""} disabled={disabled}/></label>
      <label className="span-2">備考<textarea name="notes" rows={3} defaultValue={participant.notes??""} disabled={disabled}/></label>
    </div>
    {!disabled&&<button disabled={pending}>{pending?"更新中…":"内容を更新する"}</button>}
  </form>;
}
export function CancelRegistrationForm({token,action}:{token:string;action:(formData:FormData)=>void}){
  return <form action={action} onSubmit={e=>{if(!confirm("参加予定をキャンセルします。よろしいですか？"))e.preventDefault()}}>
    <input type="hidden" name="token" value={token}/>
    <button type="submit" className="ghost-button">参加をキャンセルする</button>
  </form>;
}
