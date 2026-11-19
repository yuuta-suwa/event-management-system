"use client";
import {useState} from "react";
import {DoorOpen,Hash,QrCode,Search} from "lucide-react";
import {ExitReasonBox,type ExitSetting} from "./exit-controls";
import {CameraScanner} from "./camera-scanner";
import {CodeCheckin} from "./code-checkin";
import {SearchCheckin} from "./search-checkin";
type Tab="qr"|"code"|"search"|"exit";
type ExitTab="qr"|"code"|"search";
export function CheckinConsole({eventId,demoPaidToken,demoUnpaidToken}:{eventId:string;demoPaidToken?:string;demoUnpaidToken?:string}){
  const [tab,setTab]=useState<Tab>("qr");
  const [exitTab,setExitTab]=useState<ExitTab>("qr");
  const [exit,setExit]=useState<ExitSetting>({reason:"LEAVE",note:""});
  const tabs:{id:Tab;label:string;icon:typeof QrCode}[]=[{id:"qr",label:"QR読取",icon:QrCode},{id:"code",label:"受付コード",icon:Hash},{id:"search",label:"参加者検索",icon:Search},{id:"exit",label:"退出",icon:DoorOpen}];
  const exitTabs:{id:ExitTab;label:string;icon:typeof QrCode}[]=[{id:"qr",label:"QR読取",icon:QrCode},{id:"code",label:"受付コード",icon:Hash},{id:"search",label:"参加者検索",icon:Search}];
  return <>
    <div className="checkin-tabs" role="tablist">{tabs.map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} className={tab===t.id?"is-active":""} onClick={()=>setTab(t.id)}><t.icon/>{t.label}</button>)}</div>
    {tab==="qr"&&<CameraScanner eventId={eventId} demoPaidToken={demoPaidToken} demoUnpaidToken={demoUnpaidToken}/>}
    {tab==="code"&&<CodeCheckin eventId={eventId}/>}
    {tab==="search"&&<SearchCheckin eventId={eventId}/>}
    {tab==="exit"&&<>
      <ExitReasonBox value={exit} onChange={setExit}/>
      <div className="checkin-tabs" role="tablist" aria-label="退出の方法">{exitTabs.map(t=><button key={t.id} role="tab" aria-selected={exitTab===t.id} className={exitTab===t.id?"is-active":""} onClick={()=>setExitTab(t.id)}><t.icon/>{t.label}で退出</button>)}</div>
      {exitTab==="qr"&&<CameraScanner eventId={eventId} exit={exit}/>}
      {exitTab==="code"&&<CodeCheckin eventId={eventId} exit={exit}/>}
      {exitTab==="search"&&<SearchCheckin eventId={eventId} exit={exit}/>}
    </>}
  </>;
}
