"use client";
import {useState} from "react";
import {Check,Copy} from "lucide-react";
export function CopyApplyUrlButton({text}:{text:string}){
  const [copied,setCopied]=useState(false);
  return <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(text)}catch{}setCopied(true);setTimeout(()=>setCopied(false),2000)}}>{copied?<><Check size={16}/>コピーしました</>:<><Copy size={16}/>URLをコピー</>}</button>;
}
