"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {notificationRules} from "@/features/notifications/schedule";
type Props={defaults:{eveNotificationEnabled:boolean;eveNotificationTime:string;dayOfNotificationEnabled:boolean;dayOfNotificationTime:string;beforeStartNotificationEnabled:boolean;beforeStartNotificationMinutes:number;unpaidReminderEnabled:boolean}};
export function NotificationSettingsFields({defaults}:Props){
  const containerRef=useRef<HTMLDivElement>(null);
  const [eveOn,setEveOn]=useState(defaults.eveNotificationEnabled);
  const [eveTime,setEveTime]=useState(defaults.eveNotificationTime);
  const [dayOn,setDayOn]=useState(defaults.dayOfNotificationEnabled);
  const [dayTime,setDayTime]=useState(defaults.dayOfNotificationTime);
  const [beforeOn,setBeforeOn]=useState(defaults.beforeStartNotificationEnabled);
  const [beforeMin,setBeforeMin]=useState(defaults.beforeStartNotificationMinutes);
  const [dates,setDates]=useState({eventDate:"",startTime:""});
  useEffect(()=>{
    const form=containerRef.current?.closest("form");
    if(!form)return;
    const sync=()=>{
      const eventDate=(form.elements.namedItem("eventDate") as HTMLInputElement|null)?.value??"";
      const startTime=(form.elements.namedItem("startTime") as HTMLInputElement|null)?.value??"";
      setDates({eventDate,startTime});
    };
    sync();
    form.addEventListener("input",sync);
    return ()=>form.removeEventListener("input",sync);
  },[]);
  const preview=useMemo(()=>{
    if(!dates.eventDate||!dates.startTime)return null;
    const eventDate=new Date(`${dates.eventDate}T00:00:00+09:00`);
    const startTime=new Date(`${dates.startTime}:00+09:00`);
    if(Number.isNaN(eventDate.getTime())||Number.isNaN(startTime.getTime()))return null;
    return notificationRules({eventDate,startTime},{eveNotificationEnabled:eveOn,eveNotificationTime:eveTime,dayOfNotificationEnabled:dayOn,dayOfNotificationTime:dayTime,beforeStartNotificationEnabled:beforeOn,beforeStartNotificationMinutes:beforeMin});
  },[dates,eveOn,eveTime,dayOn,dayTime,beforeOn,beforeMin]);
  const fmt=(d:Date)=>d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
  return <div ref={containerRef} className="form-grid">
    <label className="checkbox-row"><input type="checkbox" name="eveNotificationEnabled" checked={eveOn} onChange={e=>setEveOn(e.target.checked)}/><span>前日通知</span></label>
    <label>前日通知の時刻<input type="time" name="eveNotificationTime" value={eveTime} onChange={e=>setEveTime(e.target.value)} disabled={!eveOn}/></label>
    <label className="checkbox-row"><input type="checkbox" name="dayOfNotificationEnabled" checked={dayOn} onChange={e=>setDayOn(e.target.checked)}/><span>当日通知</span></label>
    <label>当日通知の時刻<input type="time" name="dayOfNotificationTime" value={dayTime} onChange={e=>setDayTime(e.target.value)} disabled={!dayOn}/></label>
    <label className="checkbox-row"><input type="checkbox" name="beforeStartNotificationEnabled" checked={beforeOn} onChange={e=>setBeforeOn(e.target.checked)}/><span>開始前通知</span></label>
    <label>開始何分前<select name="beforeStartNotificationMinutes" value={beforeMin} onChange={e=>setBeforeMin(Number(e.target.value))} disabled={!beforeOn}><option value={180}>3時間前</option><option value={60}>1時間前</option><option value={30}>30分前</option></select></label>
    <label className="checkbox-row span-2"><input type="checkbox" name="unpaidReminderEnabled" defaultChecked={defaults.unpaidReminderEnabled}/><span>未入金リマインド通知（申込3日後）</span></label>
    <div className="span-2 notification-preview">
      <p className="eyebrow">通知予定プレビュー（JST）</p>
      {preview?<ul>{preview.map(r=><li key={r.type}>{r.label}：{r.enabled?fmt(r.scheduledAt):"OFF"}</li>)}</ul>:<p>開催日・開始時刻を入力するとプレビューが表示されます。</p>}
    </div>
  </div>;
}
