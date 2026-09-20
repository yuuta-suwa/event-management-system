import {db} from "@/server/db";
import {verifyClaimToken} from "./claim-token";
export type ClaimInfo=
  |{status:"ok";eventName:string;eventDate:Date;startTime:Date;venueName:string;address:string;price:number;buyerName:string}
  |{status:"claimed"|"invalid"|"unavailable"};
export async function getClaimInfo(token:string):Promise<ClaimInfo>{
  const secret=process.env.QR_TOKEN_SECRET;
  if(!secret)return {status:"unavailable"};
  const ticketId=verifyClaimToken(token,secret);
  if(!ticketId)return {status:"invalid"};
  const ticket=await db.ticket.findUnique({where:{id:ticketId},include:{event:true,order:{include:{buyer:true}}}});
  if(!ticket||!ticket.order)return {status:"invalid"};
  if(ticket.claimed)return {status:"claimed"};
  if(ticket.status==="CANCELLED"||ticket.status==="EXPIRED"||ticket.event.status!=="PUBLISHED")return {status:"unavailable"};
  return {status:"ok",eventName:ticket.event.name,eventDate:ticket.event.eventDate,startTime:ticket.event.startTime,venueName:ticket.event.venueName,address:ticket.event.address,price:ticket.event.price,buyerName:ticket.order.buyer.name};
}
