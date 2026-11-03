"use server";
import {redirect} from "next/navigation";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
import {loadEventAccess} from "./access";
import {collectorCustody,eligibleRecipients} from "./custody";
import {canTransitionRemittance,receiptOutcome,type RemittanceStatus} from "./remittance-domain";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;
const back=(eventId:string,kind:"notice"|"error",code:string):never=>redirect(`/remittances?event=${eventId}&${kind}=${code}`);
async function context(eventId:string){
  const user=await requireUser(STAFF);
  const ctx=await loadEventAccess(user,eventId);
  if(!ctx||!ctx.access.canView)throw new Error("FORBIDDEN");
  return {user,...ctx};
}
const known=["FORBIDDEN","NOT_FOUND","INVALID_TRANSITION","EXCEEDS_CUSTODY","INVALID_RECIPIENT","SELF_REMITTANCE","REASON_REQUIRED"];
function errorCode(error:unknown){
  if(error instanceof Error&&known.includes(error.message))return error.message.toLowerCase();
  if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2034")return "conflict";
  throw error;
}
const serializable={isolationLevel:Prisma.TransactionIsolationLevel.Serializable};
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const jst=(d:string)=>new Date(`${d}T00:00:00+09:00`);
const method=z.enum(["CASH","BANK_TRANSFER","ONLINE","OTHER"]);
const createSchema=z.object({recipientId:z.string().min(1),amount:z.coerce.number().int().min(1).max(100_000_000),method:method.default("BANK_TRANSFER"),plannedAt:day.optional().or(z.literal("")),note:z.string().trim().max(300).optional()});
export async function createRemittance(eventId:string,formData:FormData){
  const {user,access}=await context(eventId);
  if(!access.collector)throw new Error("FORBIDDEN");
  const parsed=createSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const i=parsed.data;let code="remittance_created";
  try{
    await db.$transaction(async tx=>{
      if(i.recipientId===user.id)throw new Error("SELF_REMITTANCE");
      if(!(await eligibleRecipients(tx,eventId)).some(r=>r.id===i.recipientId))throw new Error("INVALID_RECIPIENT");
      const custody=await collectorCustody(tx,eventId,user.id);
      if(i.amount>custody.available)throw new Error("EXCEEDS_CUSTODY");
      const r=await tx.remittance.create({data:{eventId,senderId:user.id,recipientId:i.recipientId,amount:i.amount,method:i.method,plannedAt:i.plannedAt?jst(i.plannedAt):null,note:i.note||null}});
      await tx.auditLog.create({data:{actorId:user.id,action:"REMITTANCE_CREATED",entityType:"Remittance",entityId:r.id,after:{amount:i.amount,recipientId:i.recipientId}}});
    },serializable);
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="remittance_created"?"notice":"error",code);
}
const reportSchema=z.object({id:z.string().min(1),sentAt:day,method,evidenceNote:z.string().trim().max(300).optional()});
export async function reportRemittanceSent(eventId:string,formData:FormData){
  const {user}=await context(eventId);
  const parsed=reportSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const i=parsed.data;let code="remittance_reported";
  try{
    await db.$transaction(async tx=>{
      const r=await tx.remittance.findFirst({where:{id:i.id,eventId}});
      if(!r)throw new Error("NOT_FOUND");
      if(r.senderId!==user.id)throw new Error("FORBIDDEN");
      if(!canTransitionRemittance(r.status as RemittanceStatus,"SENT_REPORTED"))throw new Error("INVALID_TRANSITION");
      if(r.amount>(await collectorCustody(tx,eventId,user.id)).available)throw new Error("EXCEEDS_CUSTODY");
      await tx.remittance.update({where:{id:r.id},data:{status:"SENT_REPORTED",sentAt:jst(i.sentAt),method:i.method,evidenceNote:i.evidenceNote||null,senderConfirmedAt:new Date()}});
      await tx.auditLog.create({data:{actorId:user.id,action:"REMITTANCE_SENT_REPORTED",entityType:"Remittance",entityId:r.id,before:{status:r.status},after:{status:"SENT_REPORTED",amount:r.amount}}});
    },serializable);
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="remittance_reported"?"notice":"error",code);
}
const confirmSchema=z.object({id:z.string().min(1),receivedAmount:z.coerce.number().int().min(0).max(100_000_000),receivedAt:day.optional().or(z.literal("")),discrepancyNote:z.string().trim().max(300).optional()});
export async function confirmRemittanceReceived(eventId:string,formData:FormData){
  const {user,access}=await context(eventId);
  if(!access.approver)throw new Error("FORBIDDEN");
  const parsed=confirmSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const i=parsed.data;let code="remittance_received";
  try{
    await db.$transaction(async tx=>{
      const r=await tx.remittance.findFirst({where:{id:i.id,eventId}});
      if(!r)throw new Error("NOT_FOUND");
      if(r.recipientId!==user.id)throw new Error("FORBIDDEN");
      const outcome=receiptOutcome(r.amount,i.receivedAmount);
      if(!canTransitionRemittance(r.status as RemittanceStatus,outcome))throw new Error("INVALID_TRANSITION");
      if(outcome==="DISCREPANCY"&&!i.discrepancyNote)throw new Error("REASON_REQUIRED");
      await tx.remittance.update({where:{id:r.id},data:{status:outcome,receivedAmount:i.receivedAmount,receivedAt:outcome==="RECEIVED"?(i.receivedAt?jst(i.receivedAt):new Date()):null,recipientConfirmedAt:new Date(),discrepancyNote:outcome==="DISCREPANCY"?i.discrepancyNote??null:null}});
      await tx.auditLog.create({data:{actorId:user.id,action:outcome==="RECEIVED"?"REMITTANCE_RECEIVED":"REMITTANCE_DISCREPANCY",entityType:"Remittance",entityId:r.id,before:{status:r.status},after:{status:outcome,sent:r.amount,received:i.receivedAmount}}});
    },serializable);
    code=(await db.remittance.findUnique({where:{id:i.id},select:{status:true}}))?.status==="RECEIVED"?"remittance_received":"remittance_discrepancy";
  }catch(error){code=errorCode(error)}
  return back(eventId,code.startsWith("remittance_")?"notice":"error",code);
}
const adjustSchema=z.object({id:z.string().min(1),amount:z.coerce.number().int().min(1).max(100_000_000)});
export async function adjustRemittanceAmount(eventId:string,formData:FormData){
  const {user}=await context(eventId);
  const parsed=adjustSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const i=parsed.data;let code="remittance_adjusted";
  try{
    await db.$transaction(async tx=>{
      const r=await tx.remittance.findFirst({where:{id:i.id,eventId}});
      if(!r)throw new Error("NOT_FOUND");
      if(r.senderId!==user.id)throw new Error("FORBIDDEN");
      if(r.status!=="DISCREPANCY"||r.receivedAmount===null)throw new Error("INVALID_TRANSITION");
      const custody=await collectorCustody(tx,eventId,user.id,r.id);
      if(i.amount>custody.available)throw new Error("EXCEEDS_CUSTODY");
      const outcome=receiptOutcome(i.amount,r.receivedAmount);
      await tx.remittance.update({where:{id:r.id},data:{amount:i.amount,status:outcome,senderConfirmedAt:new Date(),...(outcome==="RECEIVED"?{receivedAt:new Date(),discrepancyNote:null}:{})}});
      await tx.auditLog.create({data:{actorId:user.id,action:"REMITTANCE_AMOUNT_ADJUSTED",entityType:"Remittance",entityId:r.id,before:{amount:r.amount,status:r.status},after:{amount:i.amount,status:outcome}}});
    },serializable);
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="remittance_adjusted"?"notice":"error",code);
}
const cancelSchema=z.object({id:z.string().min(1),reason:z.string().trim().min(3).max(300)});
export async function cancelRemittance(eventId:string,formData:FormData){
  const {user}=await context(eventId);
  const parsed=cancelSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","reason_required");
  if(isLocalDemo())return back(eventId,"notice","demo");
  let code="remittance_cancelled";
  try{
    await db.$transaction(async tx=>{
      const r=await tx.remittance.findFirst({where:{id:parsed.data.id,eventId}});
      if(!r)throw new Error("NOT_FOUND");
      if(r.senderId!==user.id)throw new Error("FORBIDDEN");
      if(!canTransitionRemittance(r.status as RemittanceStatus,"CANCELLED"))throw new Error("INVALID_TRANSITION");
      await tx.remittance.update({where:{id:r.id},data:{status:"CANCELLED",cancelReason:parsed.data.reason}});
      await tx.auditLog.create({data:{actorId:user.id,action:"REMITTANCE_CANCELLED",entityType:"Remittance",entityId:r.id,before:{status:r.status},after:{reason:parsed.data.reason}}});
    });
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="remittance_cancelled"?"notice":"error",code);
}
