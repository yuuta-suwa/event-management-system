"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {del,put} from "@vercel/blob";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
const allowedTypes=new Set(["image/png","image/jpeg","image/webp"]);
const maxBytes=5*1024*1024;
export async function uploadTicketBackground(eventId:string,formData:FormData){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const file=formData.get("file");
  if(!(file instanceof File)||file.size===0)redirect(`/events/${eventId}?notice=bg-invalid`);
  if(!allowedTypes.has(file.type))redirect(`/events/${eventId}?notice=bg-invalid`);
  if(file.size>maxBytes)redirect(`/events/${eventId}?notice=bg-toolarge`);
  if(isLocalDemo())redirect(`/events/${eventId}?notice=demo`);
  const existing=await db.event.findUnique({where:{id:eventId},select:{managerId:true,ticketBackgroundUrl:true}});
  if(!existing)throw new Error("EVENT_NOT_FOUND");
  if(user.role!=="SUPER_ADMIN"&&existing.managerId!==user.id)throw new Error("FORBIDDEN");
  if(!process.env.BLOB_READ_WRITE_TOKEN)redirect(`/events/${eventId}?notice=bg-noconfig`);
  const extension=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
  const blob=await put(`ticket-backgrounds/${eventId}-${Date.now()}.${extension}`,file,{access:"public",addRandomSuffix:false});
  await db.event.update({where:{id:eventId},data:{ticketBackgroundUrl:blob.url}});
  if(existing.ticketBackgroundUrl)await del(existing.ticketBackgroundUrl).catch(()=>{});
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?notice=bg-updated`);
}
export async function removeTicketBackground(eventId:string){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  if(isLocalDemo())redirect(`/events/${eventId}?notice=demo`);
  const existing=await db.event.findUnique({where:{id:eventId},select:{managerId:true,ticketBackgroundUrl:true}});
  if(!existing)throw new Error("EVENT_NOT_FOUND");
  if(user.role!=="SUPER_ADMIN"&&existing.managerId!==user.id)throw new Error("FORBIDDEN");
  await db.event.update({where:{id:eventId},data:{ticketBackgroundUrl:null}});
  if(existing.ticketBackgroundUrl)await del(existing.ticketBackgroundUrl).catch(()=>{});
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?notice=bg-removed`);
}
