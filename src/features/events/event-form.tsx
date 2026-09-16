"use client";
import { useActionState } from "react";
import type { EventActionState } from "./actions";
import type { EventDetail } from "./data";

type Props={action:(state:EventActionState,data:FormData)=>Promise<EventActionState>;categories:{id:string;name:string}[];event?:EventDetail};
const local=(d:Date)=>{const shifted=new Date(d.getTime()-d.getTimezoneOffset()*60000);return shifted.toISOString().slice(0,16)};
export function EventForm({action,categories,event}:Props){const[state,formAction,pending]=useActionState(action,{});const err=(name:string)=>state.errors?.[name]?.[0];return <form action={formAction} className="event-form">
  {state.message&&<div className="form-banner" role="alert">{state.message}</div>}
  <section className="form-section"><div><span>01</span><h2>基本情報</h2></div><div className="form-grid">
    <label className="span-2">イベント名<input name="name" defaultValue={event?.name} required/>{err("name")&&<small>{err("name")}</small>}</label>
    <label>カテゴリー<select name="categoryId" defaultValue={event?.categoryId??""} required><option value="" disabled>選択してください</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>{err("categoryId")&&<small>{err("categoryId")}</small>}</label>
    <label>公開状態<select name="status" defaultValue={event?.status??"DRAFT"}><option value="DRAFT">非公開（下書き）</option><option value="PUBLISHED">公開・受付中</option><option value="CLOSED">受付終了</option></select></label>
    <label className="span-2">イベント説明<textarea name="description" rows={5} defaultValue={event?.description} required/>{err("description")&&<small>{err("description")}</small>}</label>
  </div></section>
  <section className="form-section"><div><span>02</span><h2>日時・会場</h2></div><div className="form-grid">
    <label>開催日<input type="date" name="eventDate" defaultValue={event?.eventDate.toISOString().slice(0,10)} required/></label><label>受付開始<input type="datetime-local" name="receptionStartTime" defaultValue={event&&local(event.receptionStartTime)} required/></label><label>開始時刻<input type="datetime-local" name="startTime" defaultValue={event&&local(event.startTime)} required/></label><label>終了時刻<input type="datetime-local" name="endTime" defaultValue={event&&local(event.endTime)} required/>{err("endTime")&&<small>{err("endTime")}</small>}</label>
    <label>会場名<input name="venueName" defaultValue={event?.venueName} required/></label><label>住所<input name="address" defaultValue={event?.address} required/></label>
  </div></section>
  <section className="form-section"><div><span>03</span><h2>申込・料金</h2></div><div className="form-grid">
    <label>定員<input type="number" name="capacity" min="1" max="10000" defaultValue={event?.capacity??30} required/></label><label>参加費（円）<input type="number" name="price" min="0" defaultValue={event?.price??0} required/></label><label>主催者<input name="organizer" defaultValue={event?.organizer} required/></label><label>申込締切<input type="datetime-local" name="applicationDeadline" defaultValue={event&&local(event.applicationDeadline)} required/>{err("applicationDeadline")&&<small>{err("applicationDeadline")}</small>}</label><label>キャンセル期限<input type="datetime-local" name="cancelDeadline" defaultValue={event?.cancelDeadline?local(event.cancelDeadline):""}/></label>
    <label className="span-2">キャンセル規定<textarea name="cancellationPolicy" rows={3} defaultValue={event?.cancellationPolicy??"チケット取得後は返金不可。主催者都合による中止の場合のみ返金します。"} required/></label><label className="span-2">銀行振込情報<textarea name="bankInformation" rows={3} defaultValue={event?.bankInformation} required/></label><label className="span-2">告知ページURL（任意）<input type="url" name="promoUrl" placeholder="https://..." defaultValue={event?.promoUrl??""}/>{err("promoUrl")&&<small>{err("promoUrl")}</small>}</label><label className="checkbox-row span-2"><input type="checkbox" name="lineNotifications" defaultChecked={event?.lineNotifications}/><span>LINE通知を有効にする</span></label>
  </div></section>
  <div className="form-footer"><a href={event?`/events/${event.id}`:"/events"}>キャンセル</a><button type="submit" disabled={pending}>{pending?"保存中…":event?"変更を保存":"イベントを作成"}</button></div>
  </form>}
