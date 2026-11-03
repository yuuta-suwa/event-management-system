import type {AttendanceStatus,PaymentStatus,TicketStatus} from "@prisma/client";
import {db} from "@/server/db";
import {verifyRegistrationToken} from "./registration-token";
import {canShareTicket} from "@/features/transfers/domain";
export type TicketHistoryRow={from:string;to:string;at:Date;source:string};
export type MyTicketRow={id:string;ticketNumber:string;holderName:string|null;isMine:boolean;paymentStatus:PaymentStatus;status:TicketStatus;checkedIn:boolean;canShare:boolean;history:TicketHistoryRow[]};
export type MyRegistrationView={
  registrationId:string;
  attendanceStatus:AttendanceStatus;
  event:{id:string;name:string;eventDate:Date;startTime:Date;endTime:Date;receptionStartTime:Date;venueName:string;address:string;price:number};
  participant:{name:string;nameKana:string;phone:string;email:string;gender:string|null;age:number|null;occupation:string|null;referrerName:string|null;snsContact:string|null;notes:string|null;lineConnected:boolean;lineLinkCode:string};
  ticket:{id:string;ticketNumber:string;version:number;status:TicketStatus;paymentStatus:PaymentStatus;checkedIn:boolean}|null;
  purchasedBy:string|null;
  order:{quantity:number;claimedCount:number}|null;
  tickets:MyTicketRow[];
};
const transferInclude={include:{oldParticipant:true,newParticipant:true},orderBy:{createdAt:"asc" as const}};
type RowSource={id:string;ticketNumber:string;claimed:boolean;participantId:string;paymentStatus:PaymentStatus;status:TicketStatus;checkin:unknown|null;transfers:{oldParticipant:{name:string};newParticipant:{name:string};createdAt:Date;source:string}[]};
export async function getMyRegistration(token:string):Promise<MyRegistrationView|null>{
  const secret=process.env.QR_TOKEN_SECRET;
  if(!secret)return null;
  const registrationId=verifyRegistrationToken(token,secret);
  if(!registrationId)return null;
  const reg=await db.eventRegistration.findUnique({where:{id:registrationId},include:{event:true,participant:true,ticket:{include:{checkin:true,order:{include:{buyer:true}},transfers:transferInclude}}}});
  if(!reg)return null;
  const order=await db.ticketOrder.findFirst({where:{eventId:reg.eventId,buyerParticipantId:reg.participantId},include:{tickets:{include:{participant:true,checkin:true,transfers:transferInclude},orderBy:{ticketNumber:"asc"}}}});
  const published=reg.event.status==="PUBLISHED";
  const toRow=(t:RowSource,holderName:string|null):MyTicketRow=>({id:t.id,ticketNumber:t.ticketNumber,holderName,isMine:t.claimed&&t.participantId===reg.participantId,paymentStatus:t.paymentStatus,status:t.status,checkedIn:Boolean(t.checkin),canShare:canShareTicket({status:t.status,hasCheckin:Boolean(t.checkin),eventPublished:published}),history:t.transfers.map(x=>({from:x.oldParticipant.name,to:x.newParticipant.name,at:x.createdAt,source:x.source}))});
  const tickets=order?order.tickets.map(t=>toRow(t,t.claimed?t.participant.name:null)):[];
  if(reg.ticket&&!tickets.some(t=>t.id===reg.ticket!.id))tickets.unshift(toRow(reg.ticket,reg.participant.name));
  return {
    registrationId:reg.id,
    attendanceStatus:reg.attendanceStatus,
    event:{id:reg.event.id,name:reg.event.name,eventDate:reg.event.eventDate,startTime:reg.event.startTime,endTime:reg.event.endTime,receptionStartTime:reg.event.receptionStartTime,venueName:reg.event.venueName,address:reg.event.address,price:reg.event.price},
    participant:{name:reg.participant.name,nameKana:reg.participant.nameKana,phone:reg.participant.phone,email:reg.participant.email,gender:reg.participant.gender,age:reg.participant.age,occupation:reg.participant.occupation,referrerName:reg.participant.referrerName,snsContact:reg.participant.snsContact,notes:reg.participant.notes,lineConnected:reg.participant.lineConnected,lineLinkCode:reg.participant.lineLinkCode},
    ticket:reg.ticket?{id:reg.ticket.id,ticketNumber:reg.ticket.ticketNumber,version:reg.ticket.qrTokenVersion,status:reg.ticket.status,paymentStatus:reg.ticket.paymentStatus,checkedIn:Boolean(reg.ticket.checkin)}:null,
    purchasedBy:reg.ticket?.order&&reg.ticket.order.buyerParticipantId!==reg.participantId?reg.ticket.order.buyer.name:null,
    order:order?{quantity:order.quantity,claimedCount:order.claimedCount}:null,
    tickets,
  };
}
