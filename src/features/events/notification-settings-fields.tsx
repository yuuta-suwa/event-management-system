"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {notificationRules} from "@/features/notifications/schedule";
type Props={defaults:{eveNotificationEnabled:boolean;eveNotificationTime:string;dayOfNotificationEnabled:boolean;dayOfNotificationTime:string;beforeStartNotificationEnabled:boolean;beforeStartNotificationMinutes:number;unpaidReminderEnabled:boolean}};
export function NotificationSettingsFields({defaults}:Props){
  const containerRef=useRef<HTMLDivElement>(null);
  const [live,setLive]=useState({
    eventDate:"",startTime:"",
    eveOn:defaults.eveNotificationEnabled,eveTime:defaults.eveNotificationTime,
    dayOn:defaults.dayOfNotificationEnabled,dayTime:defaults.dayOfNotificationTime,
    beforeOn:defaults.beforeStartNotificationEnabled,beforeMin:defaults.beforeStartNotificationMinutes,
  });
  useEffect(()=>{
    const form=containerRef.current?.closest("form");
    if(!form)return;
    const val=(name:string)=>(form.elements.namedItem(name) as HTMLInputElement|null)?.value??"";
    const checked=(name:string)=>(form.elements.namedItem(name) as HTMLInputElement|null)?.checked??false;
    const sync=()=>setLive({
      eventDate:val("eventDate"),startTime:val("startTime"),
      eveOn:checked("eveNotificationEnabled"),eveTime:val("eveNotificationTime"),
      dayOn:checked("dayOfNotificationEnabled"),dayTime:val("dayOfNotificationTime"),
      beforeOn:checked("beforeStartNotificationEnabled"),beforeMin:Number(val("beforeStartNotificationMinutes"))||defaults.beforeStartNotificationMinutes,
    });
    sync();
    form.addEventListener("input",sync);
    form.addEventListener("change",sync);
    return ()=>{form.removeEventListener("input",sync);form.removeEventListener("change",sync)};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const preview=useMemo(()=>{
    if(!live.eventDate||!live.startTime)return null;
    const eventDate=new Date(`${live.eventDate}T00:00:00+09:00`);
    const startTime=new Date(`${live.startTime}:00+09:00`);
    if(Number.isNaN(eventDate.getTime())||Number.isNaN(startTime.getTime()))return null;
    return notificationRules({eventDate,startTime},{eveNotificationEnabled:live.eveOn,eveNotificationTime:live.eveTime,dayOfNotificationEnabled:live.dayOn,dayOfNotificationTime:live.dayTime,beforeStartNotificationEnabled:live.beforeOn,beforeStartNotificationMinutes:live.beforeMin});
  },[live]);
  const fmt=(d:Date)=>d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
  return <div ref={containerRef} className="form-grid">
    <label className="checkbox-row"><input type="checkbox" name="eveNotificationEnabled" defaultChecked={defaults.eveNotificationEnabled}/><span>前日通知</span></label>
    <label>前日通知の時刻<input type="time" name="eveNotificationTime" defaultValue={defaults.eveNotificationTime}/></label>
    <label className="checkbox-row"><input type="checkbox" name="dayOfNotificationEnabled" defaultChecked={defaults.dayOfNotificationEnabled}/><span>当日通知</span></label>
    <label>当日通知の時刻<input type="time" name="dayOfNotificationTime" defaultValue={defaults.dayOfNotificationTime}/></label>
    <label className="checkbox-row"><input type="checkbox" name="beforeStartNotificationEnabled" defaultChecked={defaults.beforeStartNotificationEnabled}/><span>開始前通知</span></label>
    <label>開始何分前<select name="beforeStartNotificationMinutes" defaultValue={defaults.beforeStartNotificationMinutes}><option value={180}>3時間前</option><option value={60}>1時間前</option><option value={30}>30分前</option></select></label>
    <label className="checkbox-row span-2"><input type="checkbox" name="unpaidReminderEnabled" defaultChecked={defaults.unpaidReminderEnabled}/><span>未入金リマインド通知（申込3日後）</span></label>
    <div className="span-2 notification-preview">
      <p className="eyebrow">通知予定プレビュー（JST）</p>
      {preview?<ul>{preview.map(r=><li key={r.type}>{r.label}：{r.enabled?fmt(r.scheduledAt):"OFF"}</li>)}</ul>:<p>開催日・開始時刻を入力するとプレビューが表示されます。</p>}
    </div>
  </div>;
}
