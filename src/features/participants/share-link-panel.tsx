"use client";
import {useActionState,useState} from "react";
import {Check,Copy,Share2,Send} from "lucide-react";
import {issueShareLink,revokeShareLinks} from "./share-actions";
export function ShareLinkPanel({token,ticketId,ticketNumber,label}:{token:string;ticketId:string;ticketNumber:string;label:string}){
  const [issued,issueAction,issuing]=useActionState(issueShareLink,{});
  const [revoked,revokeAction,revoking]=useActionState(revokeShareLinks,{});
  const [copied,setCopied]=useState(false);
  const text=issued.url?`チケット（No. ${ticketNumber}）をお送りします。こちらから受け取りの登録をお願いします。\n${issued.url}`:"";
  const canNativeShare=typeof navigator!=="undefined"&&typeof navigator.share==="function";
  return <div className="share-panel">
    <form action={issueAction}><input type="hidden" name="token" value={token}/><input type="hidden" name="ticketId" value={ticketId}/><button disabled={issuing}><Send size={15}/>{issuing?"発行中…":label}</button></form>
    {issued.message&&<small>{issued.message}</small>}
    {issued.url&&<div className="share-result"><code>{issued.url}</code><small>有効期限：{issued.expires}（受け取り確定まで1回限り有効）</small>
      <div className="share-buttons">
        <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(issued.url!)}catch{}setCopied(true);setTimeout(()=>setCopied(false),2000)}}>{copied?<><Check size={15}/>コピーしました</>:<><Copy size={15}/>URLをコピー</>}</button>
        <a href={`https://line.me/R/msg/text/?${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">LINEで共有</a>
        {canNativeShare&&<button type="button" onClick={()=>{navigator.share({title:"チケットの受け取り",text,url:issued.url}).catch(()=>{})}}><Share2 size={15}/>端末の共有</button>}
      </div></div>}
    <form action={revokeAction} onSubmit={e=>{if(!confirm("発行済みの配布・譲渡リンクをすべて取り消します。よろしいですか？"))e.preventDefault()}}><input type="hidden" name="token" value={token}/><input type="hidden" name="ticketId" value={ticketId}/><button className="ghost-button" disabled={revoking}>リンクを取り消す</button></form>
    {revoked.message&&<small>{revoked.message}</small>}
  </div>;
}
