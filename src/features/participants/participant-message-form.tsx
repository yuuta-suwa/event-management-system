"use client";
import {useActionState} from "react";
import {sendParticipantMessage} from "./line-actions";
export function ParticipantMessageForm({participantId,eventId}:{participantId:string;eventId:string}){
  const [state,action,pending]=useActionState(sendParticipantMessage,{});
  return <form action={action} className="participant-message-form">
    <input type="hidden" name="participantId" value={participantId}/>
    <input type="hidden" name="eventId" value={eventId}/>
    <textarea name="message" rows={1} placeholder="メッセージを送る" required/>
    <button disabled={pending}>{pending?"送信中…":"送信"}</button>
    {state.message&&<small>{state.message}</small>}
  </form>;
}
