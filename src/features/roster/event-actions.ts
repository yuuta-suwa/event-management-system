"use server";
import {redirect} from "next/navigation";
import {requireUser} from "@/server/authz";
import {createPastEvent,renameEvent} from "./event-service";

const roles=["SUPER_ADMIN","EVENT_MANAGER"] as const;
const safeBack=(v:unknown)=>typeof v==="string"&&/^\/ledger\/books(\?[\w=&%.-]*)?$/.test(v)?v:"/ledger/books";
/** 帳簿から過去のイベントを追加し、そのまま参加者の入力画面へ進む。 */
export async function addPastEvent(formData:FormData){
  const user=await requireUser(roles);
  const back=safeBack(formData.get("back"));
  const res=await createPastEvent(user,{name:formData.get("name"),day:formData.get("day"),price:formData.get("price"),venue:formData.get("venue"),startTime:formData.get("startTime")});
  if(!res.ok)redirect(`${back}${back.includes("?")?"&":"?"}error=${res.error}`);
  redirect(`/participants/import?event=${encodeURIComponent(res.eventId)}&created=1`);
}
/** イベント名の変更(理由必須)。 */
export async function renameEventAction(formData:FormData){
  const user=await requireUser(roles);
  const eventId=String(formData.get("eventId")??"");
  const back=safeBack(formData.get("back"));
  const res=await renameEvent(user,{eventId,name:formData.get("name"),reason:formData.get("reason")});
  if(res.ok)redirect(`${back}${back.includes("?")?"&":"?"}notice=event_renamed`);
  redirect(`/ledger/books/event?event=${encodeURIComponent(eventId)}&back=${encodeURIComponent(back)}&error=${res.error}`);
}
