"use server";
import {redirect} from "next/navigation";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
import {sendRecipientTestNotice} from "./service";
const back=(kind:"notice"|"error",code:string):never=>redirect(`/settings/notifications/recipients?${kind}=${code}`);
const idSchema=z.object({id:z.string().min(1)});
/** 管理者(SUPER_ADMIN)が、LINE連携済みの参加者を「参加登録の通知の宛先」に追加する。 */
export async function addNotificationRecipient(formData:FormData){
  const user=await requireUser(["SUPER_ADMIN"]);
  const parsed=idSchema.safeParse({id:formData.get("participantId")});
  if(!parsed.success)return back("error","invalid");
  if(isLocalDemo())return back("notice","demo");
  const p=await db.participant.findUnique({where:{id:parsed.data.id},select:{id:true,lineConnected:true,lineUserId:true}});
  if(!p)return back("error","not_found");
  if(!p.lineConnected||!p.lineUserId)return back("error","not_linked");
  try{
    await db.$transaction(async tx=>{
      await tx.adminNotificationRecipient.create({data:{participantId:p.id,addedBy:user.id}});
      await tx.auditLog.create({data:{actorId:user.id,action:"ADMIN_NOTIFICATION_RECIPIENT_ADDED",entityType:"Participant",entityId:p.id}});
    });
  }catch(e){
    if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==="P2002")return back("error","already");
    throw e;
  }
  return back("notice","added");
}
/** 宛先の一時停止・再開。 */
export async function setNotificationRecipientActive(active:boolean,formData:FormData){
  const user=await requireUser(["SUPER_ADMIN"]);
  const parsed=idSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back("error","invalid");
  if(isLocalDemo())return back("notice","demo");
  const r=await db.adminNotificationRecipient.updateMany({where:{id:parsed.data.id},data:{active}});
  if(r.count!==1)return back("error","not_found");
  await db.auditLog.create({data:{actorId:user.id,action:active?"ADMIN_NOTIFICATION_RECIPIENT_RESUMED":"ADMIN_NOTIFICATION_RECIPIENT_PAUSED",entityType:"AdminNotificationRecipient",entityId:parsed.data.id}});
  return back("notice",active?"resumed":"paused");
}
/** 宛先を削除する(参加者の情報は消えない)。 */
export async function removeNotificationRecipient(formData:FormData){
  const user=await requireUser(["SUPER_ADMIN"]);
  const parsed=idSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back("error","invalid");
  if(isLocalDemo())return back("notice","demo");
  const r=await db.adminNotificationRecipient.deleteMany({where:{id:parsed.data.id}});
  if(r.count!==1)return back("error","not_found");
  await db.auditLog.create({data:{actorId:user.id,action:"ADMIN_NOTIFICATION_RECIPIENT_REMOVED",entityType:"AdminNotificationRecipient",entityId:parsed.data.id}});
  return back("notice","removed");
}
/** 追加した宛先に、テスト通知を1通送る。 */
export async function testNotificationRecipient(formData:FormData){
  await requireUser(["SUPER_ADMIN"]);
  const parsed=idSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back("error","invalid");
  if(isLocalDemo())return back("notice","demo");
  const r=await sendRecipientTestNotice(parsed.data.id);
  return back(r.status==="SENT"?"notice":"error",r.status==="SENT"?"test_sent":r.status==="FAILED"?"test_failed":"test_skipped");
}
