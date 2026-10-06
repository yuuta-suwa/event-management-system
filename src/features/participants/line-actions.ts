"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
import {pushLineMessage} from "@/features/notifications/line";
const schema=z.object({participantId:z.string().min(1),lineUserId:z.string().trim().regex(/^U[0-9A-Za-z]{5,64}$/)});
export async function connectParticipantLine(formData:FormData){const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);const parsed=schema.safeParse(Object.fromEntries(formData));if(!parsed.success)throw new Error("INVALID_LINE_USER_ID");if(isLocalDemo())redirect("/participants?notice=demo-line");const {participantId,lineUserId}=parsed.data;const allowed=user.role==="SUPER_ADMIN"||Boolean(await db.eventRegistration.findFirst({where:{participantId,event:{managerId:user.id}}}));if(!allowed)throw new Error("FORBIDDEN");await db.$transaction(async tx=>{await tx.participant.update({where:{id:participantId},data:{lineUserId,lineConnected:true}});await tx.auditLog.create({data:{actorId:user.id,action:"PARTICIPANT_LINE_CONNECTED",entityType:"Participant",entityId:participantId,after:{lineConnected:true}}})});redirect("/participants?notice=line-connected")}

const messageSchema=z.object({participantId:z.string().min(1),eventId:z.string().min(1),message:z.string().trim().min(1,"メッセージを入力してください").max(1000)});
export async function sendParticipantMessage(_:{message?:string},formData:FormData):Promise<{message?:string}>{
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const parsed=messageSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return {message:parsed.error.flatten().fieldErrors.message?.[0]??"送信内容を確認してください。"};
  if(isLocalDemo())return {message:"ローカルデモでは送信しません。"};
  const {participantId,eventId,message}=parsed.data;
  const allowed=user.role==="SUPER_ADMIN"||Boolean(await db.eventRegistration.findFirst({where:{participantId,event:{managerId:user.id}}}));
  if(!allowed)throw new Error("FORBIDDEN");
  const participant=await db.participant.findUnique({where:{id:participantId}});
  if(!participant?.lineConnected||!participant.lineUserId)return {message:"この参加者はLINE連携していません。"};
  try{
    await pushLineMessage(participant.lineUserId,message);
    await db.$transaction(async tx=>{
      await tx.notificationLog.create({data:{participantId,eventId,type:"CUSTOM",message,status:"SENT",sentAt:new Date()}});
      await tx.auditLog.create({data:{actorId:user.id,action:"PARTICIPANT_LINE_MESSAGE_SENT",entityType:"Participant",entityId:participantId,after:{message}}});
    });
    revalidatePath("/participants");revalidatePath("/notifications");
    return {message:"送信しました。"};
  }catch(error){
    const errorMessage=error instanceof Error?error.message:"UNKNOWN_ERROR";
    await db.notificationLog.create({data:{participantId,eventId,type:"CUSTOM",message,status:"FAILED",errorMessage}});
    revalidatePath("/notifications");
    return {message:`送信に失敗しました：${errorMessage}`};
  }
}
