import type {Prisma} from "@prisma/client";
import {db} from "@/server/db";
import {availableToRemit,committedRemittance,unreconciledRemittance} from "./remittance-domain";
type Client=Prisma.TransactionClient|typeof db;
export async function collectorCustody(client:Client,eventId:string,collectorId:string,excludeRemittanceId?:string){
  const [receipts,remittances,offsets]=await Promise.all([
    client.collectionReceipt.aggregate({where:{eventId,collectorId,status:{not:"VOIDED"}},_sum:{amount:true}}),
    client.remittance.findMany({where:{eventId,senderId:collectorId,...(excludeRemittanceId?{id:{not:excludeRemittanceId}}:{})},select:{status:true,amount:true}}),
    client.expenseSettlement.aggregate({where:{custodyCollectorId:collectorId,expenseAdvance:{eventId}},_sum:{amount:true}}),
  ]);
  const received=receipts._sum.amount??0,committed=committedRemittance(remittances),offset=offsets._sum.amount??0;
  return {received,committed,offsets:offset,unreconciled:unreconciledRemittance(remittances),balance:received-committed-offset,available:availableToRemit({received,committed,offsets:offset})};
}
export async function eligibleRecipients(client:Client,eventId:string){
  const approvers=await client.eventRoleAssignment.findMany({where:{eventId,role:"APPROVER",active:true},include:{user:{select:{id:true,name:true,status:true}}}});
  const active=approvers.filter(a=>a.user.status==="ACTIVE").map(a=>({id:a.user.id,name:a.user.name}));
  if(active.length>0)return active;
  return client.user.findMany({where:{role:"SUPER_ADMIN",status:"ACTIVE"},select:{id:true,name:true},orderBy:{name:"asc"}});
}
