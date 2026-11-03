import {db} from "@/server/db";
import {canShareTicket} from "@/features/transfers/domain";
import {resolveLinkToken} from "./share-token";
export type ClaimInfo=
  |{status:"ok";kind:"distribution"|"transfer";eventName:string;eventDate:Date;startTime:Date;venueName:string;address:string;price:number;fromName:string;ticketNumber:string}
  |{status:"claimed"|"invalid"|"unavailable"|"expired"|"revoked"};
export async function getClaimInfo(token:string):Promise<ClaimInfo>{
  const secret=process.env.QR_TOKEN_SECRET;
  if(!secret)return {status:"unavailable"};
  const link=resolveLinkToken(token,secret);
  if(!link.ok)return {status:link.reason};
  const ticket=await db.ticket.findUnique({where:{id:link.ticketId},include:{event:true,order:{include:{buyer:true}},participant:true,checkin:true}});
  if(!ticket)return {status:"invalid"};
  if(ticket.shareVersion!==link.shareVersion)return {status:ticket.claimed&&link.legacy?"claimed":"revoked"};
  if(ticket.claimed&&link.legacy)return {status:"claimed"};
  if(!canShareTicket({status:ticket.status,hasCheckin:Boolean(ticket.checkin),eventPublished:ticket.event.status==="PUBLISHED"}))return {status:"unavailable"};
  if(!ticket.claimed&&!ticket.order)return {status:"invalid"};
  const kind=ticket.claimed?"transfer":"distribution";
  const fromName=kind==="transfer"?ticket.participant.name:ticket.order!.buyer.name;
  return {status:"ok",kind,eventName:ticket.event.name,eventDate:ticket.event.eventDate,startTime:ticket.event.startTime,venueName:ticket.event.venueName,address:ticket.event.address,price:ticket.event.price,fromName,ticketNumber:ticket.ticketNumber};
}
