"use client";
import {useState} from "react";
import {Hash,QrCode,Search} from "lucide-react";
import {CameraScanner} from "./camera-scanner";
import {CodeCheckin} from "./code-checkin";
import {SearchCheckin} from "./search-checkin";
type Tab="qr"|"code"|"search";
export function CheckinConsole({eventId,demoPaidToken,demoUnpaidToken}:{eventId:string;demoPaidToken?:string;demoUnpaidToken?:string}){
  const [tab,setTab]=useState<Tab>("qr");
  const tabs:{id:Tab;label:string;icon:typeof QrCode}[]=[{id:"qr",label:"QR読取",icon:QrCode},{id:"code",label:"受付コード",icon:Hash},{id:"search",label:"参加者検索",icon:Search}];
  return <>
    <div className="checkin-tabs" role="tablist">{tabs.map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} className={tab===t.id?"is-active":""} onClick={()=>setTab(t.id)}><t.icon/>{t.label}</button>)}</div>
    {tab==="qr"&&<CameraScanner eventId={eventId} demoPaidToken={demoPaidToken} demoUnpaidToken={demoUnpaidToken}/>}
    {tab==="code"&&<CodeCheckin eventId={eventId}/>}
    {tab==="search"&&<SearchCheckin eventId={eventId}/>}
  </>;
}
