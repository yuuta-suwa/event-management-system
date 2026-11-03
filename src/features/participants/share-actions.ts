"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo} from "@/server/authz";
import {verifyRegistrationToken} from "./registration-token";
import {issueShareToken,shareExpiry} from "@/features/tickets/share-token";
import {qrTokenSecret} from "@/features/tickets/token";
import {canShareTicket} from "@/features/transfers/domain";
export type ShareState={url?:string;expires?:string;message?:string};
const schema=z.object({token:z.string().min(1),ticketId:z.string().min(1)});
async function authorize(raw:FormData){
  const parsed=schema.safeParse(Object.fromEntries(raw));
  if(!parsed.success)return {error:"入力内容を確認してください。"} as const;
  const registrationId=verifyRegistrationToken(parsed.data.token,qrTokenSecret());
  if(!registrationId)return {error:"リンクが無効です。"} as const;
  const registration=await db.eventRegistration.findUnique({where:{id:registrationId}});
  const ticket=await db.ticket.findUnique({where:{id:parsed.data.ticketId},include:{event:true,checkin:true,order:true}});
  if(!registration||!ticket)return {error:"チケットが見つかりません。"} as const;
  const holder=ticket.claimed&&ticket.participantId===registration.participantId&&registration.ticketId===ticket.id;
  const purchaserDistributing=!ticket.claimed&&ticket.order?.buyerParticipantId===registration.participantId;
  if(!holder&&!purchaserDistributing)return {error:"このチケットは操作できません。現在の保有者のみ譲渡できます。"} as const;
  if(!canShareTicket({status:ticket.status,hasCheckin:Boolean(ticket.checkin),eventPublished:ticket.event.status==="PUBLISHED"}))return {error:"受付済み・取消済みのチケットは譲渡できません。"} as const;
  return {ticket,registration,token:parsed.data.token} as const;
}
export async function issueShareLink(_:ShareState,formData:FormData):Promise<ShareState>{
  if(isLocalDemo())return {message:"ローカルデモでは発行できません。"};
  const auth=await authorize(formData);
  if("error" in auth)return {message:auth.error};
  const expiresAt=shareExpiry(7);
  const link=issueShareToken({ticketId:auth.ticket.id,shareVersion:auth.ticket.shareVersion,expiresAt},qrTokenSecret());
  await db.auditLog.create({data:{action:"TICKET_SHARE_LINK_ISSUED",entityType:"Ticket",entityId:auth.ticket.id,after:{ticketNumber:auth.ticket.ticketNumber,participantId:auth.registration.participantId,expiresAt:new Date(expiresAt*1000).toISOString()}}});
  const origin=process.env.NEXT_PUBLIC_APP_URL??"http://127.0.0.1:3000";
  return {url:`${origin}/claim/${link}`,expires:new Date(expiresAt*1000).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})};
}
export async function revokeShareLinks(_:ShareState,formData:FormData):Promise<ShareState>{
  if(isLocalDemo())return {message:"ローカルデモでは取り消せません。"};
  const auth=await authorize(formData);
  if("error" in auth)return {message:auth.error};
  await db.$transaction(async tx=>{
    await tx.ticket.update({where:{id:auth.ticket.id},data:{shareVersion:{increment:1}}});
    await tx.auditLog.create({data:{action:"TICKET_SHARE_LINK_REVOKED",entityType:"Ticket",entityId:auth.ticket.id,after:{ticketNumber:auth.ticket.ticketNumber,participantId:auth.registration.participantId}}});
  });
  revalidatePath(`/my/${auth.token}`);
  return {message:"発行済みの配布・譲渡リンクをすべて取り消しました。"};
}
