"use server";
import {redirect} from "next/navigation";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
import {retryTransient} from "@/server/transient";
import {hashTicketToken,issueTicketToken,qrTokenSecret} from "@/features/tickets/token";
import {queueParticipantNotification} from "@/features/notifications/service";
import {deliverEmail,kickEmailDelivery,resendTicketEmail} from "@/features/email/service";
import {markTicketPaid} from "./mark-paid";
import {ISSUE_BASIS,issuePlan,type IssueBasis} from "./issue-domain";
const schema=z.object({ticketId:z.string().min(1),basis:z.enum(ISSUE_BASIS).optional(),back:z.string().optional()});
const backTo=(back:string|undefined,kind:"notice"|"error",code:string):never=>{
  const base=back&&back.startsWith("/participants")?back.split("?")[0]:"/participants";
  const eventId=back?.match(/[?&]event=([^&]+)/)?.[1];
  redirect(`${base}?${eventId?`event=${eventId}&`:""}${kind}=${code}`);
};
/**
 * チケットの発行・送付(再送)。立替・招待など、入金の記録がなくてもチケットを使えるようにする管理者用の操作。
 *  - 未入金: 「立替で受領済み」「招待・無料」「入金確認済み」のいずれかの理由で入金済みにしてQRを発行し、メール(とLINE)で送る。
 *  - 入金済み: QRを確認し(必要なら再発行し)、メール(とLINE)で再送する。
 * どの場合も監査ログに残す。
 */
export async function issueAndSendTicket(formData:FormData){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const parsed=schema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return backTo(undefined,"error","invalid");
  const {ticketId,basis,back}=parsed.data;
  if(isLocalDemo())return backTo(back,"notice","demo");
  let code="ticket_sent";
  try{
    code=await retryTransient(()=>issueOnce(user,ticketId,basis));
  }catch(error){
    if(error instanceof Error&&error.message.startsWith("ISSUE_"))code=error.message.slice(6).toLowerCase();
    else{console.error("[issueAndSendTicket]",error);code="failed"}
  }
  kickEmailDelivery();
  return backTo(back,code.startsWith("ticket_")?"notice":"error",code);
}
async function issueOnce(user:{id:string;role:string},ticketId:string,basis:IssueBasis|undefined):Promise<string>{
  const ticket=await db.ticket.findUnique({where:{id:ticketId},include:{event:true,checkin:true}});
  if(!ticket)throw new Error("ISSUE_NOT_FOUND");
  if(user.role!=="SUPER_ADMIN"&&ticket.event.managerId!==user.id)throw new Error("ISSUE_FORBIDDEN");
  const plan=issuePlan({claimed:ticket.claimed,status:ticket.status,paymentStatus:ticket.paymentStatus,hasCheckin:Boolean(ticket.checkin),basis});
  if(plan.kind==="REJECT")throw new Error(`ISSUE_${plan.reason}`);
  if(plan.kind==="ACTIVATE"){
    await db.$transaction(async tx=>{
      const fresh=await tx.ticket.findUniqueOrThrow({where:{id:ticket.id}});
      if(fresh.paymentStatus==="PAID")throw new Error("ISSUE_ALREADY_PAID");
      await markTicketPaid(tx,{id:fresh.id,eventId:fresh.eventId,participantId:fresh.participantId,claimed:fresh.claimed,qrTokenVersion:fresh.qrTokenVersion,paymentStatus:fresh.paymentStatus},{lineNotifications:ticket.event.lineNotifications,price:ticket.event.price},{method:plan.method,payerName:null,paidAt:new Date(),confirmedBy:user.id,amount:plan.amount(ticket.event.price),source:`MANUAL_ISSUE_${plan.basis}`});
      await tx.auditLog.create({data:{actorId:user.id,action:"TICKET_ISSUED_MANUALLY",entityType:"Ticket",entityId:ticket.id,before:{paymentStatus:ticket.paymentStatus},after:{basis:plan.basis,ticketNumber:ticket.ticketNumber}}});
    });
    // 作ったばかりのメールをその場で送って、結果(送れたか・未設定か)を管理者に返す
    const log=await db.emailLog.findFirst({where:{ticketId:ticket.id,status:"PENDING"},orderBy:{createdAt:"desc"}});
    const outcome=log?await deliverEmail(log.id):null;
    return outcome==="sent"?"ticket_issued_sent":outcome==="skipped"?"ticket_issued_noemail":outcome==="failed"?"ticket_issued_mailfailed":"ticket_issued_sent";
  }
  // 入金済み: 有効なQRに揃えてから再送する
  const token=issueTicketToken(ticket.id,ticket.qrTokenVersion,qrTokenSecret());
  await db.$transaction(async tx=>{
    if(ticket.status!=="ACTIVE"||ticket.qrTokenHash!==hashTicketToken(token))await tx.ticket.update({where:{id:ticket.id},data:{status:"ACTIVE",qrTokenHash:hashTicketToken(token),issuedAt:ticket.issuedAt??new Date()}});
    if(ticket.event.lineNotifications)await queueParticipantNotification(tx,ticket.eventId,ticket.participantId,"TICKET");
    await tx.auditLog.create({data:{actorId:user.id,action:"TICKET_RESENT_MANUALLY",entityType:"Ticket",entityId:ticket.id,after:{ticketNumber:ticket.ticketNumber}}});
  });
  const r=await resendTicketEmail(ticket.id,{id:user.id});
  if(!r.ok)throw new Error(r.code==="rate_limited"?"ISSUE_RATE_LIMITED":"ISSUE_NOT_RESENDABLE");
  return r.code==="sent"?"ticket_sent":r.code==="skipped"?"ticket_resent_noemail":"ticket_resent_mailfailed";
}
