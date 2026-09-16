"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { isLocalDemo, requireUser } from "@/server/authz";
import { eventFormSchema } from "./schema";

export type EventActionState = { ok?:boolean; message?:string; errors?:Record<string,string[]> };

function parseForm(formData:FormData){
  return eventFormSchema.safeParse({
    name:formData.get("name"), categoryId:formData.get("categoryId"), description:formData.get("description"),
    eventDate:formData.get("eventDate"), startTime:formData.get("startTime"), receptionStartTime:formData.get("receptionStartTime"), endTime:formData.get("endTime"),
    venueName:formData.get("venueName"), address:formData.get("address"), capacity:formData.get("capacity"), price:formData.get("price"), organizer:formData.get("organizer"),
    applicationDeadline:formData.get("applicationDeadline"), cancelDeadline:formData.get("cancelDeadline")||undefined, cancellationPolicy:formData.get("cancellationPolicy"), bankInformation:formData.get("bankInformation"),
    promoUrl:formData.get("promoUrl")||undefined,
    status:formData.get("status"), lineNotifications:formData.get("lineNotifications")==="on",
  });
}

function dbInput(input:ReturnType<typeof eventFormSchema.parse>,managerId:string){return {
  categoryId:input.categoryId,name:input.name,description:input.description,eventDate:new Date(`${input.eventDate}T00:00:00+09:00`),
  startTime:new Date(`${input.startTime}+09:00`),receptionStartTime:new Date(`${input.receptionStartTime}+09:00`),endTime:new Date(`${input.endTime}+09:00`),venueName:input.venueName,address:input.address,
  capacity:input.capacity,price:input.price,organizer:input.organizer,managerId,applicationDeadline:new Date(`${input.applicationDeadline}+09:00`),cancelDeadline:input.cancelDeadline?new Date(`${input.cancelDeadline}+09:00`):null,
  cancellationPolicy:input.cancellationPolicy,bankInformation:input.bankInformation,promoUrl:input.promoUrl||null,status:input.status,lineNotifications:input.lineNotifications,
};}

export async function createEvent(_:EventActionState,formData:FormData):Promise<EventActionState>{
  const user=await requireUser(["SUPER_ADMIN"]);const parsed=parseForm(formData);
  if(!parsed.success)return {message:"入力内容を確認してください。",errors:parsed.error.flatten().fieldErrors};
  if(isLocalDemo()){redirect("/events/demo-autumn-2026?notice=demo")}
  const event=await db.$transaction(async tx=>{const created=await tx.event.create({data:dbInput(parsed.data,user.id)});await tx.auditLog.create({data:{actorId:user.id,action:"EVENT_CREATED",entityType:"Event",entityId:created.id,after:created}});return created});
  revalidatePath("/events");redirect(`/events/${event.id}?notice=created`);
}

export async function updateEvent(id:string,_:EventActionState,formData:FormData):Promise<EventActionState>{
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);const parsed=parseForm(formData);
  if(!parsed.success)return {message:"入力内容を確認してください。",errors:parsed.error.flatten().fieldErrors};
  if(isLocalDemo()){redirect(`/events/${id}?notice=demo`)}
  const existing=await db.event.findUnique({where:{id}});if(!existing)return {message:"イベントが見つかりません。"};
  if(user.role!=="SUPER_ADMIN"&&existing.managerId!==user.id)throw new Error("FORBIDDEN");
  await db.$transaction(async tx=>{const updated=await tx.event.update({where:{id},data:dbInput(parsed.data,existing.managerId)});await tx.auditLog.create({data:{actorId:user.id,action:"EVENT_UPDATED",entityType:"Event",entityId:id,before:existing,after:updated}})});
  revalidatePath("/events");revalidatePath(`/events/${id}`);redirect(`/events/${id}?notice=updated`);
}
