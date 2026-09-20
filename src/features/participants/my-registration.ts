import type {AttendanceStatus,PaymentStatus,TicketStatus} from "@prisma/client";
import {db} from "@/server/db";
import {verifyRegistrationToken} from "./registration-token";
import {issueClaimToken} from "@/features/tickets/claim-token";
export type MyRegistrationView={
  registrationId:string;
  attendanceStatus:AttendanceStatus;
  event:{id:string;name:string;eventDate:Date;startTime:Date;endTime:Date;receptionStartTime:Date;venueName:string;address:string;bankInformation:string;price:number};
  participant:{name:string;nameKana:string;phone:string;email:string;gender:string|null;age:number|null;occupation:string|null;referrerName:string|null;snsContact:string|null;notes:string|null;lineConnected:boolean;lineLinkCode:string};
  ticket:{id:string;version:number;status:TicketStatus;paymentStatus:PaymentStatus;checkedIn:boolean}|null;
  order:{quantity:number;claimedCount:number;claimTokens:string[]}|null;
};
export async function getMyRegistration(token:string):Promise<MyRegistrationView|null>{
  const secret=process.env.QR_TOKEN_SECRET;
  if(!secret)return null;
  const registrationId=verifyRegistrationToken(token,secret);
  if(!registrationId)return null;
  const reg=await db.eventRegistration.findUnique({where:{id:registrationId},include:{event:true,participant:true,ticket:{include:{checkin:true}}}});
  if(!reg)return null;
  const order=await db.ticketOrder.findFirst({where:{eventId:reg.eventId,buyerParticipantId:reg.participantId},include:{tickets:{where:{claimed:false}}}});
  return {
    registrationId:reg.id,
    attendanceStatus:reg.attendanceStatus,
    event:{id:reg.event.id,name:reg.event.name,eventDate:reg.event.eventDate,startTime:reg.event.startTime,endTime:reg.event.endTime,receptionStartTime:reg.event.receptionStartTime,venueName:reg.event.venueName,address:reg.event.address,bankInformation:reg.event.bankInformation,price:reg.event.price},
    participant:{name:reg.participant.name,nameKana:reg.participant.nameKana,phone:reg.participant.phone,email:reg.participant.email,gender:reg.participant.gender,age:reg.participant.age,occupation:reg.participant.occupation,referrerName:reg.participant.referrerName,snsContact:reg.participant.snsContact,notes:reg.participant.notes,lineConnected:reg.participant.lineConnected,lineLinkCode:reg.participant.lineLinkCode},
    ticket:reg.ticket?{id:reg.ticket.id,version:reg.ticket.qrTokenVersion,status:reg.ticket.status,paymentStatus:reg.ticket.paymentStatus,checkedIn:Boolean(reg.ticket.checkin)}:null,
    order:order?{quantity:order.quantity,claimedCount:order.claimedCount,claimTokens:order.tickets.map(t=>issueClaimToken(t.id,secret))}:null,
  };
}
