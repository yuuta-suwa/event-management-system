import type {Prisma} from "@prisma/client";
import {hashTicketToken,issueTicketToken,qrTokenSecret} from "@/features/tickets/token";
import {queueParticipantNotification} from "@/features/notifications/service";
import {assertPaymentTransition} from "./domain";
type TicketLike={id:string;eventId:string;participantId:string;claimed:boolean;qrTokenVersion:number;paymentStatus:"UNPAID"|"PENDING"|"PAID"|"CANCELLED"|"REFUNDED"};
export async function markTicketPaid(tx:Prisma.TransactionClient,ticket:TicketLike,event:{price:number;lineNotifications:boolean},input:{method:string;payerName?:string|null;paidAt:Date;confirmedBy:string;orderId?:string|null}){
  assertPaymentTransition(ticket.paymentStatus,"PAID");
  const token=issueTicketToken(ticket.id,ticket.qrTokenVersion,qrTokenSecret());
  const payment=await tx.payment.create({data:{ticketId:ticket.id,amount:event.price,paymentMethod:input.method,status:"PAID",payerName:input.payerName||null,paidAt:input.paidAt,confirmedBy:input.confirmedBy,confirmedAt:new Date()}});
  await tx.ticket.update({where:{id:ticket.id},data:{paymentStatus:"PAID",status:"ACTIVE",qrTokenHash:hashTicketToken(token),issuedAt:new Date()}});
  await tx.eventRegistration.updateMany({where:{ticketId:ticket.id},data:{attendanceStatus:"PAID"}});
  if(event.lineNotifications&&ticket.claimed){
    await tx.notificationJob.updateMany({where:{eventId:ticket.eventId,type:"PAYMENT_REMINDER",status:"PENDING",payload:{equals:{participantId:ticket.participantId}}},data:{status:"CANCELLED"}});
    await queueParticipantNotification(tx,ticket.eventId,ticket.participantId,"PAYMENT_CONFIRMED");
    await queueParticipantNotification(tx,ticket.eventId,ticket.participantId,"TICKET");
  }
  await tx.auditLog.create({data:{actorId:input.confirmedBy,action:"PAYMENT_STATUS_UPDATED",entityType:"Payment",entityId:payment.id,before:{status:ticket.paymentStatus},after:{status:"PAID",amount:event.price,ticketActivated:true,orderId:input.orderId??null,source:"COLLECTION_RECEIPT"}}});
}
