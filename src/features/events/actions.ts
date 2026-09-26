"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { isLocalDemo, requireUser } from "@/server/authz";
import { parseJstDateTime } from "@/lib/jst";
import { eventFormSchema } from "./schema";

export type EventActionState = { ok?:boolean; message?:string; errors?:Record<string,string[]>; values?:Record<string,string> };

const echoFields=["name","categoryId","description","eventDate","startTime","receptionStartTime","endTime","venueName","address","capacity","price","organizer","applicationDeadline","cancelDeadline","cancellationPolicy","bankInformation","promoUrl","status","lineNotifications"] as const;
function rawValues(formData:FormData):Record<string,string>{const out:Record<string,string>={};for(const key of echoFields){const v=formData.get(key);if(typeof v==="string")out[key]=v}return out}

function parseForm(formData:FormData){
  return eventFormSchema.safeParse({
    name:formData.get("name"), categoryId:formData.get("categoryId"), description:formData.get("description"),
    eventDate:formData.get("eventDate"), startTime:formData.get("startTime"), receptionStartTime:formData.get("receptionStartTime"), endTime:formData.get("endTime"),
    venueName:formData.get("venueName"), address:formData.get("address"), capacity:formData.get("capacity"), price:formData.get("price"), organizer:formData.get("organizer"),
    applicationDeadline:formData.get("applicationDeadline"), cancelDeadline:formData.get("cancelDeadline")||undefined, cancellationPolicy:formData.get("cancellationPolicy"), bankInformation:formData.get("bankInformation"),
    promoUrl:formData.get("promoUrl")||undefined,
    status:formData.get("status"), lineNotifications:formData.get("lineNotifications")==="on",
    eveNotificationEnabled:formData.get("eveNotificationEnabled")==="on", eveNotificationTime:formData.get("eveNotificationTime")||undefined,
    dayOfNotificationEnabled:formData.get("dayOfNotificationEnabled")==="on", dayOfNotificationTime:formData.get("dayOfNotificationTime")||undefined,
    beforeStartNotificationEnabled:formData.get("beforeStartNotificationEnabled")==="on", beforeStartNotificationMinutes:formData.get("beforeStartNotificationMinutes")||undefined,
    unpaidReminderEnabled:formData.get("unpaidReminderEnabled")==="on",
  });
}

function dbInput(input:ReturnType<typeof eventFormSchema.parse>,managerId:string){return {
  categoryId:input.categoryId,name:input.name,description:input.description,eventDate:parseJstDateTime(input.eventDate),
  startTime:parseJstDateTime(input.startTime),receptionStartTime:parseJstDateTime(input.receptionStartTime),endTime:parseJstDateTime(input.endTime),venueName:input.venueName,address:input.address,
  capacity:input.capacity,price:input.price,organizer:input.organizer,managerId,applicationDeadline:parseJstDateTime(input.applicationDeadline),cancelDeadline:input.cancelDeadline?parseJstDateTime(input.cancelDeadline):null,
  cancellationPolicy:input.cancellationPolicy,bankInformation:input.bankInformation,promoUrl:input.promoUrl||null,status:input.status,lineNotifications:input.lineNotifications,
  eveNotificationEnabled:input.eveNotificationEnabled,eveNotificationTime:input.eveNotificationTime,dayOfNotificationEnabled:input.dayOfNotificationEnabled,dayOfNotificationTime:input.dayOfNotificationTime,
  beforeStartNotificationEnabled:input.beforeStartNotificationEnabled,beforeStartNotificationMinutes:input.beforeStartNotificationMinutes,unpaidReminderEnabled:input.unpaidReminderEnabled,
};}

export async function createEvent(_:EventActionState,formData:FormData):Promise<EventActionState>{
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);const parsed=parseForm(formData);
  if(!parsed.success)return {message:"入力内容を確認してください。",errors:parsed.error.flatten().fieldErrors,values:rawValues(formData)};
  if(isLocalDemo()){redirect("/events/demo-autumn-2026?notice=demo")}
  const event=await db.$transaction(async tx=>{const created=await tx.event.create({data:dbInput(parsed.data,user.id)});await tx.auditLog.create({data:{actorId:user.id,action:"EVENT_CREATED",entityType:"Event",entityId:created.id,after:created}});return created});
  revalidatePath("/events");redirect(`/events/${event.id}?notice=created`);
}

export async function updateEvent(id:string,_:EventActionState,formData:FormData):Promise<EventActionState>{
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);const parsed=parseForm(formData);
  if(!parsed.success)return {message:"入力内容を確認してください。",errors:parsed.error.flatten().fieldErrors,values:rawValues(formData)};
  if(isLocalDemo()){redirect(`/events/${id}?notice=demo`)}
  const existing=await db.event.findUnique({where:{id}});if(!existing)return {message:"イベントが見つかりません。"};
  if(user.role!=="SUPER_ADMIN"&&existing.managerId!==user.id)throw new Error("FORBIDDEN");
  await db.$transaction(async tx=>{const updated=await tx.event.update({where:{id},data:dbInput(parsed.data,existing.managerId)});await tx.auditLog.create({data:{actorId:user.id,action:"EVENT_UPDATED",entityType:"Event",entityId:id,before:existing,after:updated}})});
  revalidatePath("/events");revalidatePath(`/events/${id}`);redirect(`/events/${id}?notice=updated`);
}
