import type {Prisma} from "@prisma/client";
import {db} from "@/server/db";
type Client=Prisma.TransactionClient|typeof db;
const unavailable={status:{notIn:["CANCELLED","EXPIRED"] as ("CANCELLED"|"EXPIRED")[]},paymentStatus:{notIn:["CANCELLED","REFUNDED"] as ("CANCELLED"|"REFUNDED")[]}};
export async function loadTarget(client:Client,eventId:string,target:string){
  const [kind,id]=target.split(":");
  if(kind==="order"){
    if(!await client.ticketOrder.findFirst({where:{id,eventId},select:{id:true}}))return null;
    return {kind:"order" as const,id,tickets:await client.ticket.findMany({where:{orderId:id,eventId,...unavailable},orderBy:{ticketNumber:"asc"}})};
  }
  if(kind==="ticket"){
    const ticket=await client.ticket.findFirst({where:{id,eventId,orderId:null,...unavailable}});
    return ticket?{kind:"ticket" as const,id,tickets:[ticket]}:null;
  }
  return null;
}
export async function targetReceiptAmounts(client:Client,t:{kind:"order"|"ticket";id:string}){
  const rows=await client.collectionReceipt.findMany({where:{status:{not:"VOIDED"},...(t.kind==="order"?{orderId:t.id}:{ticketId:t.id})},select:{amount:true}});
  return rows.map(r=>r.amount);
}
