"use client";
import {useActionState} from "react";
import {sendGroupBroadcast} from "./group-actions";
export function GroupBroadcastForm({groupId}:{groupId:string}){
  const [state,action,pending]=useActionState(sendGroupBroadcast,{});
  return <form action={action}>
    <input type="hidden" name="groupId" value={groupId}/>
    <textarea name="message" rows={1} placeholder="このグループに送るメッセージ" required/>
    <button disabled={pending}>{pending?"送信中…":"一斉送信"}</button>
    {state.message&&<small>{state.message}</small>}
  </form>;
}
