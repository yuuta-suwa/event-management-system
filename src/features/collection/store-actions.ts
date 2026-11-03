"use server";
import {redirect} from "next/navigation";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
import {loadEventAccess} from "./access";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;
const back=(eventId:string,kind:"notice"|"error",code:string):never=>redirect(`/store-payments?event=${eventId}&${kind}=${code}`);
async function approverContext(eventId:string){
  const user=await requireUser(STAFF);
  const ctx=await loadEventAccess(user,eventId);
  if(!ctx||!ctx.access.approver)throw new Error("FORBIDDEN");
  return {user,...ctx};
}
const known=["NOT_FOUND","EXPENSE_UNAVAILABLE","ADVANCE_EXPENSE","EXCEEDS_BALANCE","ALREADY_VOIDED"];
function errorCode(error:unknown){
  if(error instanceof Error&&known.includes(error.message))return error.message.toLowerCase();
  if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2034")return "conflict";
  throw error;
}
const serializable={isolationLevel:Prisma.TransactionIsolationLevel.Serializable};
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const jst=(d:string)=>new Date(`${d}T00:00:00+09:00`);
const createSchema=z.object({payee:z.string().trim().min(1).max(120),description:z.string().trim().max(200).optional(),plannedAmount:z.coerce.number().int().min(1).max(100_000_000).optional(),plannedDate:day.optional().or(z.literal("")),expenseId:z.string().optional()});
export async function createStorePayment(eventId:string,formData:FormData){
  const {user}=await approverContext(eventId);
  const parsed=createSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(!parsed.data.expenseId&&!parsed.data.plannedAmount)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const i=parsed.data;let code="store_created";
  try{
    await db.$transaction(async tx=>{
      let expenseId:string,amount:number;
      if(i.expenseId){
        const e=await tx.eventExpense.findFirst({where:{id:i.expenseId,eventId},include:{advance:true,storePayment:true}});
        if(!e||e.storePayment)throw new Error("EXPENSE_UNAVAILABLE");
        if(e.advance)throw new Error("ADVANCE_EXPENSE");
        expenseId=e.id;amount=e.amount;
      }else{
        amount=i.plannedAmount!;
        const e=await tx.eventExpense.create({data:{eventId,label:i.description?`${i.payee}（${i.description}）`:i.payee,amount,note:"店舗支払"}});
        expenseId=e.id;
      }
      const sp=await tx.storePayment.create({data:{eventId,expenseId,payee:i.payee,description:i.description||null,plannedAmount:amount,plannedDate:i.plannedDate?jst(i.plannedDate):null,createdBy:user.id}});
      await tx.auditLog.create({data:{actorId:user.id,action:"STORE_PAYMENT_CREATED",entityType:"StorePayment",entityId:sp.id,after:{payee:i.payee,plannedAmount:amount,expenseId,linkedExisting:Boolean(i.expenseId)}}});
    });
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="store_created"?"notice":"error",code);
}
const recordSchema=z.object({id:z.string().min(1),amount:z.coerce.number().int().min(1).max(100_000_000),paidAt:day,method:z.enum(["CASH","BANK_TRANSFER","ONLINE","OTHER"]).default("BANK_TRANSFER"),evidenceNote:z.string().trim().max(300).optional(),receiptNote:z.string().trim().max(300).optional()});
export async function recordStorePayment(eventId:string,formData:FormData){
  const {user}=await approverContext(eventId);
  const parsed=recordSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const i=parsed.data;let code="store_paid";
  try{
    await db.$transaction(async tx=>{
      const sp=await tx.storePayment.findFirst({where:{id:i.id,eventId},include:{records:{where:{status:"RECORDED"}}}});
      if(!sp)throw new Error("NOT_FOUND");
      const paid=sp.records.reduce((n,r)=>n+r.amount,0);
      if(i.amount>sp.plannedAmount-paid)throw new Error("EXCEEDS_BALANCE");
      const rec=await tx.storePaymentRecord.create({data:{storePaymentId:sp.id,amount:i.amount,paidAt:jst(i.paidAt),method:i.method,evidenceNote:i.evidenceNote||null,receiptNote:i.receiptNote||null,createdBy:user.id}});
      await tx.auditLog.create({data:{actorId:user.id,action:"STORE_PAYMENT_RECORDED",entityType:"StorePaymentRecord",entityId:rec.id,after:{storePaymentId:sp.id,amount:i.amount,paidTotal:paid+i.amount,expenseRecognizedOnce:true}}});
    },serializable);
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="store_paid"?"notice":"error",code);
}
const voidSchema=z.object({recordId:z.string().min(1),reason:z.string().trim().min(3).max(300)});
export async function voidStorePaymentRecord(eventId:string,formData:FormData){
  const {user}=await approverContext(eventId);
  const parsed=voidSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  let code="store_voided";
  try{
    await db.$transaction(async tx=>{
      const rec=await tx.storePaymentRecord.findFirst({where:{id:parsed.data.recordId,storePayment:{eventId}}});
      if(!rec)throw new Error("NOT_FOUND");
      if(rec.status==="VOIDED")throw new Error("ALREADY_VOIDED");
      await tx.storePaymentRecord.update({where:{id:rec.id},data:{status:"VOIDED",voidedAt:new Date(),voidedBy:user.id,voidReason:parsed.data.reason}});
      await tx.auditLog.create({data:{actorId:user.id,action:"STORE_PAYMENT_VOIDED",entityType:"StorePaymentRecord",entityId:rec.id,before:{amount:rec.amount,status:rec.status},after:{reason:parsed.data.reason}}});
    });
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="store_voided"?"notice":"error",code);
}
