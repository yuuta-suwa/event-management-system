"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { formatJstDate, formatJstDateTimeLocal } from "@/lib/jst";
import { NotificationSettingsFields } from "./notification-settings-fields";
import { applyDraftToForm, clearEventDraft, readEventDraft, serializeForm, writeEventDraft } from "./draft-storage";
import type { EventActionState } from "./actions";
import type { EventDetail } from "./data";

type Props={action:(state:EventActionState,data:FormData)=>Promise<EventActionState>;categories:{id:string;name:string}[];event?:EventDetail};
const local=formatJstDateTimeLocal;
const fieldLabels:Record<string,string>={name:"イベント名",categoryId:"カテゴリー",description:"イベント説明",eventDate:"開催日",receptionStartTime:"受付開始",startTime:"開始時刻",endTime:"終了時刻",venueName:"会場名",address:"住所",capacity:"定員",price:"参加費",organizer:"主催者",applicationDeadline:"申込締切",cancelDeadline:"キャンセル期限",cancellationPolicy:"キャンセル規定",bankInformation:"銀行振込情報",promoUrl:"告知ページURL",eveNotificationTime:"前日通知の時刻",dayOfNotificationTime:"当日通知の時刻",beforeStartNotificationMinutes:"開始何分前"};
export function EventForm({action,categories,event}:Props){
  const[state,formAction,pending]=useActionState(action,{});
  const err=(name:string)=>state.errors?.[name]?.[0];
  const v=(name:string,fallback?:string)=>state.values?.[name] ?? fallback;
  const checkedV=(name:string,fallback?:boolean)=>state.values?state.values[name]==="on":Boolean(fallback);
  const isNew=!event;
  const formRef=useRef<HTMLFormElement>(null);
  const [draftRestored,setDraftRestored]=useState(false);
  const [categoryId,setCategoryId]=useState(()=>state.values?.categoryId ?? event?.categoryId ?? "");
  const [status,setStatus]=useState(()=>state.values?.status ?? event?.status ?? "DRAFT");
  const [syncedValues,setSyncedValues]=useState(state.values);
  if(state.values!==syncedValues){
    setSyncedValues(state.values);
    if(state.values?.categoryId!==undefined)setCategoryId(state.values.categoryId);
    if(state.values?.status!==undefined)setStatus(state.values.status);
  }
  useEffect(()=>{
    if(!isNew)return;
    const form=formRef.current;
    if(!form)return;
    const restore=()=>{const draft=readEventDraft();if(draft){applyDraftToForm(form,draft);if(typeof draft.categoryId==="string")setCategoryId(draft.categoryId);if(typeof draft.status==="string")setStatus(draft.status);form.dispatchEvent(new Event("input",{bubbles:true}));setDraftRestored(true)}};
    restore();
    let timer:ReturnType<typeof setTimeout>|undefined;
    const save=()=>{clearTimeout(timer);timer=setTimeout(()=>writeEventDraft(serializeForm(form)),400)};
    form.addEventListener("input",save);
    form.addEventListener("change",save);
    return ()=>{clearTimeout(timer);form.removeEventListener("input",save);form.removeEventListener("change",save);clearEventDraft()};
  },[isNew]);
  const discardDraft=()=>{clearEventDraft();setDraftRestored(false);formRef.current?.reset();window.location.reload()};
  return <form ref={formRef} action={formAction} className="event-form">
  {isNew&&draftRestored&&<div className="success-banner">前回の入力内容を復元しました。<button type="button" onClick={discardDraft}>破棄してやり直す</button></div>}
  {state.message&&<div className="form-banner" role="alert">
    <p>{state.message}</p>
    {state.errors&&<ul>{Object.entries(state.errors).map(([field,msgs])=><li key={field}>{fieldLabels[field]??field}：{msgs[0]}</li>)}</ul>}
  </div>}
  <section className="form-section"><div><span>01</span><h2>基本情報</h2></div><div className="form-grid">
    <label className="span-2">イベント名<input name="name" defaultValue={v("name",event?.name)} required/>{err("name")&&<small>{err("name")}</small>}</label>
    <label>カテゴリー<select name="categoryId" value={categoryId} onChange={e=>setCategoryId(e.target.value)} required><option value="" disabled>選択してください</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>{err("categoryId")&&<small>{err("categoryId")}</small>}</label>
    <label>公開状態<select name="status" value={status} onChange={e=>setStatus(e.target.value)}><option value="DRAFT">非公開（下書き）</option><option value="PUBLISHED">公開・受付中</option><option value="CLOSED">受付終了</option></select></label>
    <label className="span-2">イベント説明<textarea name="description" rows={5} defaultValue={v("description",event?.description)} required/>{err("description")&&<small>{err("description")}</small>}</label>
  </div></section>
  <section className="form-section"><div><span>02</span><h2>日時・会場</h2></div><div className="form-grid">
    <label>開催日<input type="date" name="eventDate" defaultValue={v("eventDate",event&&formatJstDate(event.eventDate))} required/></label><label>受付開始<input type="datetime-local" name="receptionStartTime" defaultValue={v("receptionStartTime",event&&local(event.receptionStartTime))} required/></label><label>開始時刻<input type="datetime-local" name="startTime" defaultValue={v("startTime",event&&local(event.startTime))} required/></label><label>終了時刻<input type="datetime-local" name="endTime" defaultValue={v("endTime",event&&local(event.endTime))} required/>{err("endTime")&&<small>{err("endTime")}</small>}</label>
    <label>会場名<input name="venueName" defaultValue={v("venueName",event?.venueName)} required/></label><label>住所<input name="address" defaultValue={v("address",event?.address)} required/></label>
  </div></section>
  <section className="form-section"><div><span>03</span><h2>申込・料金</h2></div><div className="form-grid">
    <label>定員<input type="number" name="capacity" min="1" max="10000" defaultValue={v("capacity",String(event?.capacity??30))} required/></label><label>参加費（円）<input type="number" name="price" min="0" defaultValue={v("price",String(event?.price??0))} required/></label><label>主催者<input name="organizer" defaultValue={v("organizer",event?.organizer)} required/></label><label>申込締切<input type="datetime-local" name="applicationDeadline" defaultValue={v("applicationDeadline",event&&local(event.applicationDeadline))} required/>{err("applicationDeadline")&&<small>{err("applicationDeadline")}</small>}</label><label>キャンセル期限<input type="datetime-local" name="cancelDeadline" defaultValue={v("cancelDeadline",event?.cancelDeadline?local(event.cancelDeadline):"")}/></label>
    <label className="span-2">キャンセル規定<textarea name="cancellationPolicy" rows={3} defaultValue={v("cancellationPolicy",event?.cancellationPolicy??"チケット取得後は返金不可。主催者都合による中止の場合のみ返金します。")} required/></label><label className="span-2">銀行振込情報<textarea name="bankInformation" rows={3} defaultValue={v("bankInformation",event?.bankInformation)} required/></label><label className="span-2">告知ページURL（任意）<input type="url" name="promoUrl" placeholder="https://..." defaultValue={v("promoUrl",event?.promoUrl??"")}/>{err("promoUrl")&&<small>{err("promoUrl")}</small>}</label><label className="checkbox-row span-2"><input type="checkbox" name="lineNotifications" defaultChecked={checkedV("lineNotifications",event?.lineNotifications)}/><span>LINE通知を有効にする</span></label>
  </div></section>
  <section className="form-section"><div><span>04</span><h2>LINE通知設定</h2></div>
    <NotificationSettingsFields restoreDraft={isNew} defaults={{
      eveNotificationEnabled:event?.eveNotificationEnabled??true,
      eveNotificationTime:event?.eveNotificationTime??"18:00",
      dayOfNotificationEnabled:event?.dayOfNotificationEnabled??false,
      dayOfNotificationTime:event?.dayOfNotificationTime??"12:00",
      beforeStartNotificationEnabled:event?.beforeStartNotificationEnabled??true,
      beforeStartNotificationMinutes:event?.beforeStartNotificationMinutes??180,
      unpaidReminderEnabled:event?.unpaidReminderEnabled??true,
    }}/>
  </section>
  <div className="form-footer"><a href={event?`/events/${event.id}`:"/events"}>キャンセル</a><button type="submit" disabled={pending}>{pending?"保存中…":event?"変更を保存":"イベントを作成"}</button></div>
  </form>}
