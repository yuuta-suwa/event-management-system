"use server";
import {redirect} from "next/navigation";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
import {markTicketPaid} from "@/features/payments/mark-paid";
import {loadEventAccess} from "./access";
import {loadTarget,targetReceiptAmounts} from "./targets";
import {summarizeBilling,targetSummary} from "./domain";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;
const back=(eventId:string,kind:"notice"|"error",code:string):never=>redirect(`/collection?event=${eventId}&${kind}=${code}`);
async function context(eventId:string){
  const user=await requireUser(STAFF);
  const ctx=await loadEventAccess(user,eventId);
  if(!ctx||!ctx.access.canView)throw new Error("FORBIDDEN");
  return {user,...ctx};
}
function errorCode(error:unknown){
  if(error instanceof Error&&["TARGET_NOT_FOUND","FORBIDDEN","ALREADY_PAID","OVERPAYMENT","FULLY_PAID_LOCK","RECEIPT_NOT_FOUND","ALREADY_VOIDED","INVALID_COLLECTOR"].includes(error.message))return error.message.toLowerCase();
  if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2034")return "conflict";
  throw error;
}
const receiptSchema=z.object({target:z.string().min(3),amount:z.coerce.number().int().min(1).max(10_000_000),method:z.enum(["CASH","BANK_TRANSFER","ONLINE","OTHER"]),receivedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),payerName:z.string().trim().max(120).optional(),note:z.string().trim().max(300).optional()});
export async function recordReceipt(eventId:string,formData:FormData){
  const {user,event,access}=await context(eventId);
  const parsed=receiptSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const i=parsed.data;let code="saved";
  try{
    await db.$transaction(async tx=>{
      const t=await loadTarget(tx,eventId,i.target);
      if(!t||t.tickets.length===0)throw new Error("TARGET_NOT_FOUND");
      if(!(access.manager||(access.collector&&t.tickets.every(x=>x.collectorId===user.id))))throw new Error("FORBIDDEN");
      const before=targetSummary(event.price,t.tickets,await targetReceiptAmounts(tx,t));
      if(before.unpaid<=0)throw new Error("ALREADY_PAID");
      if(i.amount>before.unpaid)throw new Error("OVERPAYMENT");
      const first=t.tickets[0].collectorId;
      const collectorId=first&&t.tickets.every(x=>x.collectorId===first)?first:user.id;
      const paidAt=new Date(`${i.receivedAt}T00:00:00+09:00`);
      const receipt=await tx.collectionReceipt.create({data:{eventId,collectorId,orderId:t.kind==="order"?t.id:null,ticketId:t.kind==="ticket"?t.id:null,payerName:i.payerName||null,amount:i.amount,method:i.method,receivedAt:paidAt,note:i.note||null}});
      const complete=summarizeBilling(before.billed,[before.received+i.amount]).unpaid===0;
      if(complete)for(const ticket of t.tickets.filter(x=>x.paymentStatus!=="PAID"))await markTicketPaid(tx,ticket,event,{method:i.method,payerName:i.payerName,paidAt,confirmedBy:user.id,orderId:t.kind==="order"?t.id:null});
      await tx.auditLog.create({data:{actorId:user.id,action:"COLLECTION_RECEIPT_RECORDED",entityType:"CollectionReceipt",entityId:receipt.id,after:{target:i.target,amount:i.amount,method:i.method,collectorId,completed:complete}}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="saved"?"notice":"error",code);
}
const voidSchema=z.object({receiptId:z.string().min(1),reason:z.string().trim().min(3,"理由を入力してください").max(300)});
export async function voidReceipt(eventId:string,formData:FormData){
  const {user,event,access}=await context(eventId);
  const parsed=voidSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  let code="voided";
  try{
    await db.$transaction(async tx=>{
      const receipt=await tx.collectionReceipt.findFirst({where:{id:parsed.data.receiptId,eventId}});
      if(!receipt)throw new Error("RECEIPT_NOT_FOUND");
      if(receipt.status==="VOIDED")throw new Error("ALREADY_VOIDED");
      if(!(access.manager||(access.collector&&receipt.collectorId===user.id)))throw new Error("FORBIDDEN");
      const t=await loadTarget(tx,eventId,receipt.orderId?`order:${receipt.orderId}`:`ticket:${receipt.ticketId}`);
      if(t){
        const amounts=await targetReceiptAmounts(tx,t);
        const before=targetSummary(event.price,t.tickets,amounts);
        if(before.status!=="UNPAID"&&before.status!=="PARTIAL"&&summarizeBilling(before.billed,[before.received-receipt.amount]).unpaid>0)throw new Error("FULLY_PAID_LOCK");
      }
      await tx.collectionReceipt.update({where:{id:receipt.id},data:{status:"VOIDED",voidedAt:new Date(),voidedBy:user.id,voidReason:parsed.data.reason}});
      await tx.auditLog.create({data:{actorId:user.id,action:"COLLECTION_RECEIPT_VOIDED",entityType:"CollectionReceipt",entityId:receipt.id,before:{amount:receipt.amount,status:receipt.status},after:{status:"VOIDED",reason:parsed.data.reason}}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="voided"?"notice":"error",code);
}
const assignSchema=z.object({target:z.string().min(3),collectorId:z.string().optional()});
export async function assignCollector(eventId:string,formData:FormData){
  const {user,access}=await context(eventId);
  if(!access.manager)throw new Error("FORBIDDEN");
  const parsed=assignSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const collectorId=parsed.data.collectorId||null;let code="assigned";
  try{
    await db.$transaction(async tx=>{
      if(collectorId&&!await tx.eventRoleAssignment.findFirst({where:{eventId,userId:collectorId,role:"COLLECTOR",active:true}}))throw new Error("INVALID_COLLECTOR");
      const t=await loadTarget(tx,eventId,parsed.data.target);
      if(!t)throw new Error("TARGET_NOT_FOUND");
      await tx.ticket.updateMany({where:{id:{in:t.tickets.map(x=>x.id)}},data:{collectorId}});
      await tx.auditLog.create({data:{actorId:user.id,action:"COLLECTOR_ASSIGNED",entityType:t.kind==="order"?"TicketOrder":"Ticket",entityId:t.id,after:{collectorId}}});
    });
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="assigned"?"notice":"error",code);
}
const roleSchema=z.object({userId:z.string().min(1),mode:z.enum(["add","remove"])});
export async function setCollectorRole(eventId:string,formData:FormData){
  const {user,access}=await context(eventId);
  if(!access.manager)throw new Error("FORBIDDEN");
  const parsed=roleSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const target=await db.user.findUnique({where:{id:parsed.data.userId},select:{id:true,role:true,status:true}});
  if(!target||target.role==="PARTICIPANT"||target.status!=="ACTIVE")return back(eventId,"error","invalid_collector");
  await db.$transaction(async tx=>{
    if(parsed.data.mode==="add"){
      await tx.eventRoleAssignment.upsert({where:{eventId_userId_role:{eventId,userId:target.id,role:"COLLECTOR"}},update:{active:true,revokedAt:null,assignedBy:user.id},create:{eventId,userId:target.id,role:"COLLECTOR",assignedBy:user.id}});
    }else{
      await tx.eventRoleAssignment.updateMany({where:{eventId,userId:target.id,role:"COLLECTOR",active:true},data:{active:false,revokedAt:new Date()}});
      await tx.ticket.updateMany({where:{eventId,collectorId:target.id},data:{collectorId:null}});
    }
    await tx.auditLog.create({data:{actorId:user.id,action:parsed.data.mode==="add"?"COLLECTOR_ROLE_GRANTED":"COLLECTOR_ROLE_REVOKED",entityType:"EventRoleAssignment",entityId:`${eventId}:${target.id}`,after:{eventId,userId:target.id}}});
  });
  return back(eventId,"notice",parsed.data.mode==="add"?"collector_added":"collector_removed");
}
