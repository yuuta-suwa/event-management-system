"use client";
import {useState} from "react";
export function CopyButton({text,label="コピー"}:{text:string;label?:string}){
  const [done,setDone]=useState(false);
  return <button type="button" className="demo-ticket-link" onClick={async()=>{try{await navigator.clipboard.writeText(text);setDone(true);setTimeout(()=>setDone(false),2000)}catch{window.prompt("コピーしてください",text)}}}>{done?"コピーしました":label}</button>;
}
