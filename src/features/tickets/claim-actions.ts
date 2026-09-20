"use server";
import {redirect} from "next/navigation";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo} from "@/server/authz";
import {queueParticipantNotification} from "@/features/notifications/service";
import {issueRegistrationToken} from "@/features/participants/registration-token";
import {generateLineLinkCode} from "@/features/participants/line-link-code";
import {nextQrVersion} from "@/features/transfers/domain";
import {verifyClaimToken} from "./claim-token";
import {hashTicketToken,issueTicketToken,qrTokenSecret} from "./token";
export type ClaimState={message?:string;errors?:Record<string,string[]>};
const claimSchema=z.object({token:z.string().min(1),name:z.string().trim().min(1).max(100),nameKana:z.string().trim().min(1).max(120),phone:z.string().trim().regex(/^[0-9+()-]{8,20}$/,"電話番号を確認してください"),email:z.string().trim().email(),gender:z.enum(["","MALE","FEMALE","OTHER"]).optional(),age:z.union([z.literal(""),z.coerce.number().int().min(0).max(120)]).optional(),occupation:z.string().trim().max(120).optional(),referrerName:z.string().trim().max(100).optional(),snsContact:z.string().trim().max(200).optional(),notes:z.string().trim().max(1000).optional(),privacy:z.literal("on")});
export async function claimTicket(_:ClaimState,formData:FormData):Promise<ClaimState>{
  const parsed=claimSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return {message:"入力内容を確認してください。",errors:parsed.error.flatten().fieldErrors};
  const input=parsed.data;
  if(isLocalDemo())return {message:"ローカルデモではチケットを受け取れません。"};
  const secret=qrTokenSecret();
  const ticketId=verifyClaimToken(input.token,secret);
  if(!ticketId)return {message:"リンクが無効です。"};
  let myToken:string;
  try{
    myToken=await db.$transaction(async tx=>{
      const ticket=await tx.ticket.findUnique({where:{id:ticketId},include:{event:true}});
      if(!ticket||!ticket.orderId)throw new Error("INVALID_TICKET");
      if(ticket.claimed)throw new Error("ALREADY_CLAIMED");
      if(ticket.status==="CANCELLED"||ticket.status==="EXPIRED"||ticket.event.status!=="PUBLISHED")throw new Error("TICKET_UNAVAILABLE");
      let participant=await tx.participant.findFirst({where:{OR:[{email:input.email.toLowerCase()},{phone:input.phone}]}});
      const data={name:input.name,nameKana:input.nameKana,phone:input.phone,email:input.email.toLowerCase(),gender:input.gender||null,age:input.age===""||input.age===undefined?null:Number(input.age),occupation:input.occupation||null,referrerName:input.referrerName||null,snsContact:input.snsContact||null,notes:input.notes||null};
      participant=participant?await tx.participant.update({where:{id:participant.id},data}):await tx.participant.create({data:{...data,lineLinkCode:generateLineLinkCode()}});
      const duplicate=await tx.eventRegistration.findUnique({where:{eventId_participantId:{eventId:ticket.eventId,participantId:participant.id}}});
      if(duplicate)throw new Error("ALREADY_REGISTERED");
      const version=nextQrVersion(ticket.qrTokenVersion);
      const newToken=issueTicketToken(ticket.id,version,secret);
      await tx.ticket.update({where:{id:ticket.id},data:{participantId:participant.id,qrTokenVersion:version,qrTokenHash:hashTicketToken(newToken),claimed:true}});
      const registration=await tx.eventRegistration.create({data:{eventId:ticket.eventId,participantId:participant.id,ticketId:ticket.id,applicationSource:"ORDER_CLAIM"}});
      await tx.ticketOrder.update({where:{id:ticket.orderId},data:{claimedCount:{increment:1}}});
      if(ticket.event.lineNotifications){await queueParticipantNotification(tx,ticket.eventId,participant.id,"APPLICATION");if(ticket.paymentStatus!=="PAID")await queueParticipantNotification(tx,ticket.eventId,participant.id,"PAYMENT_REMINDER",new Date(Date.now()+3*24*60*60*1000))}
      await tx.auditLog.create({data:{action:"TICKET_CLAIMED",entityType:"Ticket",entityId:ticket.id,after:{participantId:participant.id,orderId:ticket.orderId}}});
      return issueRegistrationToken(registration.id,secret);
    });
  }catch(error){
    const code=error instanceof Error?error.message:"UNKNOWN";
    if(code==="ALREADY_CLAIMED")return {message:"このチケットはすでに受け取り済みです。"};
    if(code==="ALREADY_REGISTERED")return {message:"このメールアドレス・電話番号はすでに登録されています。別の連絡先を入力してください。"};
    if(code==="TICKET_UNAVAILABLE"||code==="INVALID_TICKET")return {message:"このチケットは現在受け取れません。"};
    throw error;
  }
  redirect(`/my/${myToken}?notice=claimed`);
}
