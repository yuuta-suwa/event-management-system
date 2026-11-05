"use server";
import {redirect} from "next/navigation";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo} from "@/server/authz";
import {queueParticipantNotification} from "@/features/notifications/service";
import {issueRegistrationToken} from "@/features/participants/registration-token";
import {generateLineLinkCode} from "@/features/participants/line-link-code";
import {nextQrVersion} from "@/features/transfers/domain";
import {resolveLinkToken} from "./share-token";
import {canShareTicket} from "@/features/transfers/domain";
import {moveRegistration} from "@/features/transfers/move-registration";
import {hashTicketToken,issueTicketToken,qrTokenSecret} from "./token";
export type ClaimState={message?:string;errors?:Record<string,string[]>};
const claimSchema=z.object({token:z.string().min(1),name:z.string().trim().min(1).max(100),nameKana:z.string().trim().min(1).max(120),phone:z.string().trim().regex(/^[0-9+()-]{8,20}$/,"電話番号を確認してください"),email:z.string().trim().email(),gender:z.enum(["","MALE","FEMALE","OTHER"]).optional(),age:z.union([z.literal(""),z.coerce.number().int().min(0).max(120)]).optional(),occupation:z.string().trim().max(120).optional(),referrerName:z.string().trim().max(100).optional(),snsContact:z.string().trim().max(200).optional(),notes:z.string().trim().max(1000).optional(),privacy:z.literal("on")});
export async function claimTicket(_:ClaimState,formData:FormData):Promise<ClaimState>{
  const parsed=claimSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return {message:"入力内容を確認してください。",errors:parsed.error.flatten().fieldErrors};
  const input=parsed.data;
  if(isLocalDemo())return {message:"ローカルデモではチケットを受け取れません。"};
  const secret=qrTokenSecret();
  const link=resolveLinkToken(input.token,secret);
  if(!link.ok)return {message:link.reason==="expired"?"リンクの有効期限が切れています。渡す方に新しいリンクの発行を依頼してください。":"リンクが無効です。"};
  let myToken:string;
  try{
    myToken=await db.$transaction(async tx=>{
      const ticket=await tx.ticket.findUnique({where:{id:link.ticketId},include:{event:true,checkin:true,order:true}});
      if(!ticket)throw new Error("INVALID_TICKET");
      if(ticket.shareVersion!==link.shareVersion)throw new Error(ticket.claimed&&link.legacy?"ALREADY_CLAIMED":"LINK_REVOKED");
      if(ticket.claimed&&link.legacy)throw new Error("ALREADY_CLAIMED");
      if(!canShareTicket({status:ticket.status,hasCheckin:Boolean(ticket.checkin),eventPublished:ticket.event.status==="PUBLISHED"}))throw new Error("TICKET_UNAVAILABLE");
      const transfer=ticket.claimed;
      if(!transfer&&!ticket.orderId)throw new Error("INVALID_TICKET");
      let participant=await tx.participant.findFirst({where:{OR:[{email:input.email.toLowerCase()},{phone:input.phone}]}});
      const data={name:input.name,nameKana:input.nameKana,phone:input.phone,email:input.email.toLowerCase(),gender:input.gender||null,age:input.age===""||input.age===undefined?null:Number(input.age),occupation:input.occupation||null,referrerName:input.referrerName||null,snsContact:input.snsContact||null,notes:input.notes||null};
      participant=participant?await tx.participant.update({where:{id:participant.id},data}):await tx.participant.create({data:{...data,lineLinkCode:generateLineLinkCode()}});
      if(transfer&&participant.id===ticket.participantId)throw new Error("SAME_HOLDER");
      const fromParticipantId=transfer?ticket.participantId:ticket.order!.buyerParticipantId;
      const version=nextQrVersion(ticket.qrTokenVersion);
      const newToken=issueTicketToken(ticket.id,version,secret);
      const swapped=await tx.ticket.updateMany({where:{id:ticket.id,shareVersion:ticket.shareVersion,claimed:ticket.claimed},data:{participantId:participant.id,qrTokenVersion:version,qrTokenHash:hashTicketToken(newToken),receptionCode:null,receptionCodeIssuedAt:null,claimed:true,transferredAt:transfer?new Date():undefined,shareVersion:{increment:1}}});
      if(swapped.count!==1)throw new Error("ALREADY_CLAIMED");
      const registration=await moveRegistration(tx,{ticketId:ticket.id,eventId:ticket.eventId,toParticipantId:participant.id,orderClaim:!transfer});
      const registrationId=registration.id;
      if(!transfer)await tx.ticketOrder.update({where:{id:ticket.orderId!},data:{claimedCount:{increment:1}}});
      const record=await tx.ticketTransfer.create({data:{ticketId:ticket.id,oldParticipantId:fromParticipantId,newParticipantId:participant.id,transferredBy:null,source:transfer?"HOLDER":"DISTRIBUTION",reason:transfer?"保有者による譲渡":"購入者による配布",oldQrTokenHash:ticket.qrTokenHash}});
      if(ticket.event.lineNotifications){
        await queueParticipantNotification(tx,ticket.eventId,participant.id,"APPLICATION");
        if(ticket.paymentStatus==="PAID")await queueParticipantNotification(tx,ticket.eventId,participant.id,"TICKET");
        else await queueParticipantNotification(tx,ticket.eventId,participant.id,"PAYMENT_REMINDER",new Date(Date.now()+3*24*60*60*1000));
      }
      await tx.auditLog.create({data:{action:transfer?"TICKET_TRANSFERRED_BY_HOLDER":"TICKET_CLAIMED",entityType:"TicketTransfer",entityId:record.id,before:{participantId:fromParticipantId,qrTokenVersion:ticket.qrTokenVersion},after:{participantId:participant.id,qrTokenVersion:version,ticketNumber:ticket.ticketNumber,orderId:ticket.orderId,paymentStatus:ticket.paymentStatus}}});
      return issueRegistrationToken(registrationId,secret);
    });
  }catch(error){
    const code=error instanceof Error?error.message:"UNKNOWN";
    if(code==="ALREADY_CLAIMED")return {message:"このチケットはすでに受け取り済みです。"};
    if(code==="LINK_REVOKED")return {message:"このリンクは取り消されました。渡す方に新しいリンクの発行を依頼してください。"};
    if(code==="SAME_HOLDER")return {message:"現在の保有者と同じ方には譲渡できません。"};
    if(code==="ALREADY_REGISTERED")return {message:"このメールアドレス・電話番号はすでに登録されています。別の連絡先を入力してください。"};
    if(code==="TICKET_UNAVAILABLE"||code==="INVALID_TICKET")return {message:"このチケットは現在受け取れません。"};
    throw error;
  }
  redirect(`/my/${myToken}?notice=claimed`);
}
