"use server";
import {redirect} from "next/navigation";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
import {loadEventAccess} from "./access";
import {canTransitionExpense,feeAdvanceStatus,settlementStatus,unsettled,type ExpenseAdvanceStatus} from "./domain";
import {loadTarget} from "./targets";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;
const back=(eventId:string,kind:"notice"|"error",code:string):never=>redirect(`/advances?event=${eventId}&${kind}=${code}`);
async function context(eventId:string){
  const user=await requireUser(STAFF);
  const ctx=await loadEventAccess(user,eventId);
  if(!ctx||!ctx.access.canView)throw new Error("FORBIDDEN");
  return {user,...ctx};
}
const known=["FORBIDDEN","NOT_FOUND","INVALID_TRANSITION","EXCEEDS_BALANCE","HAS_RECORDS","TARGET_NOT_FOUND","SELF_APPROVAL"];
function errorCode(error:unknown){
  if(error instanceof Error&&known.includes(error.message))return error.message.toLowerCase();
  if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2034")return "conflict";
  throw error;
}
const serializable={isolationLevel:Prisma.TransactionIsolationLevel.Serializable};
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const jst=(d:string)=>new Date(`${d}T00:00:00+09:00`);
const method=z.enum(["CASH","BANK_TRANSFER","ONLINE","OTHER"]);

const feeSchema=z.object({obligorName:z.string().trim().min(1).max(120),advancerName:z.string().trim().min(1).max(120),target:z.string().optional(),amount:z.coerce.number().int().min(1).max(10_000_000),advancedAt:day,method,evidenceNote:z.string().trim().max(300).optional()});
export async function recordFeeAdvance(eventId:string,formData:FormData){
  const {user,access}=await context(eventId);
  if(!access.manager&&!access.collector)throw new Error("FORBIDDEN");
  const parsed=feeSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const i=parsed.data;let code="fee_saved";
  try{
    await db.$transaction(async tx=>{
      let orderId:string|null=null,ticketId:string|null=null,obligorParticipantId:string|null=null;
      if(i.target){
        const t=await loadTarget(tx,eventId,i.target);
        if(!t)throw new Error("TARGET_NOT_FOUND");
        if(!(access.manager||t.tickets.every(x=>x.collectorId===user.id)))throw new Error("FORBIDDEN");
        orderId=t.kind==="order"?t.id:null;ticketId=t.kind==="ticket"?t.id:null;
        obligorParticipantId=t.tickets[0]?.participantId??null;
      }
      const advance=await tx.feeAdvance.create({data:{eventId,obligorName:i.obligorName,obligorParticipantId,advancerName:i.advancerName,orderId,ticketId,amount:i.amount,advancedAt:jst(i.advancedAt),method:i.method,evidenceNote:i.evidenceNote||null,createdBy:user.id}});
      await tx.auditLog.create({data:{actorId:user.id,action:"FEE_ADVANCE_RECORDED",entityType:"FeeAdvance",entityId:advance.id,after:{amount:i.amount,advancerName:i.advancerName,obligorName:i.obligorName,orderId,ticketId}}});
    });
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="fee_saved"?"notice":"error",code);
}
const recoverySchema=z.object({feeAdvanceId:z.string().min(1),amount:z.coerce.number().int().min(1).max(10_000_000),recoveredAt:day,method,note:z.string().trim().max(300).optional()});
export async function recordFeeRecovery(eventId:string,formData:FormData){
  const {user,access}=await context(eventId);
  if(!access.manager&&!access.collector)throw new Error("FORBIDDEN");
  const parsed=recoverySchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const i=parsed.data;let code="recovery_saved";
  try{
    await db.$transaction(async tx=>{
      const advance=await tx.feeAdvance.findFirst({where:{id:i.feeAdvanceId,eventId},include:{recoveries:true}});
      if(!advance)throw new Error("NOT_FOUND");
      if(advance.status==="CANCELLED"||advance.status==="RECOVERED")throw new Error("INVALID_TRANSITION");
      const recovered=advance.recoveries.reduce((n,r)=>n+r.amount,0);
      if(i.amount>advance.amount-recovered)throw new Error("EXCEEDS_BALANCE");
      const recovery=await tx.feeAdvanceRecovery.create({data:{feeAdvanceId:advance.id,amount:i.amount,recoveredAt:jst(i.recoveredAt),method:i.method,note:i.note||null,createdBy:user.id}});
      const status=feeAdvanceStatus(advance.amount,recovered+i.amount);
      await tx.feeAdvance.update({where:{id:advance.id},data:{status}});
      await tx.auditLog.create({data:{actorId:user.id,action:"FEE_ADVANCE_RECOVERED",entityType:"FeeAdvanceRecovery",entityId:recovery.id,after:{feeAdvanceId:advance.id,amount:i.amount,status}}});
    },serializable);
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="recovery_saved"?"notice":"error",code);
}
export async function cancelFeeAdvance(eventId:string,formData:FormData){
  const {user,access}=await context(eventId);
  const id=String(formData.get("feeAdvanceId")??"");
  if(isLocalDemo())return back(eventId,"notice","demo");
  let code="fee_cancelled";
  try{
    await db.$transaction(async tx=>{
      const advance=await tx.feeAdvance.findFirst({where:{id,eventId},include:{recoveries:true}});
      if(!advance)throw new Error("NOT_FOUND");
      if(!(access.manager||advance.createdBy===user.id))throw new Error("FORBIDDEN");
      if(advance.recoveries.length>0)throw new Error("HAS_RECORDS");
      if(advance.status==="CANCELLED")throw new Error("INVALID_TRANSITION");
      await tx.feeAdvance.update({where:{id},data:{status:"CANCELLED",cancelledAt:new Date()}});
      await tx.auditLog.create({data:{actorId:user.id,action:"FEE_ADVANCE_CANCELLED",entityType:"FeeAdvance",entityId:id,before:{status:advance.status}}});
    });
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="fee_cancelled"?"notice":"error",code);
}

const expenseSchema=z.object({advancerName:z.string().trim().min(1).max(120),category:z.string().trim().min(1).max(60),payee:z.string().trim().min(1).max(120),amount:z.coerce.number().int().min(1).max(100_000_000),paidAt:day,evidenceNote:z.string().trim().max(300).optional()});
export async function requestExpenseAdvance(eventId:string,formData:FormData){
  const {user,access}=await context(eventId);
  if(!access.manager&&!access.collector)throw new Error("FORBIDDEN");
  const parsed=expenseSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const i=parsed.data;
  await db.$transaction(async tx=>{
    const advance=await tx.expenseAdvance.create({data:{eventId,advancerName:i.advancerName,category:i.category,payee:i.payee,amount:i.amount,paidAt:jst(i.paidAt),evidenceNote:i.evidenceNote||null,requestedBy:user.id}});
    await tx.auditLog.create({data:{actorId:user.id,action:"EXPENSE_ADVANCE_REQUESTED",entityType:"ExpenseAdvance",entityId:advance.id,after:{amount:i.amount,category:i.category,payee:i.payee,advancerName:i.advancerName}}});
  });
  return back(eventId,"notice","expense_requested");
}
const decisionSchema=z.object({id:z.string().min(1),decision:z.enum(["review","approve","return"]),reason:z.string().trim().max(300).optional()});
export async function decideExpenseAdvance(eventId:string,formData:FormData){
  const {user,access}=await context(eventId);
  if(!access.approver)throw new Error("FORBIDDEN");
  const parsed=decisionSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(parsed.data.decision==="return"&&!parsed.data.reason)return back(eventId,"error","reason_required");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const {id,decision,reason}=parsed.data;const target:ExpenseAdvanceStatus=decision==="review"?"REVIEWING":decision==="approve"?"APPROVED":"RETURNED";
  let code=decision==="review"?"expense_reviewing":decision==="approve"?"expense_approved":"expense_returned";
  try{
    await db.$transaction(async tx=>{
      const advance=await tx.expenseAdvance.findFirst({where:{id,eventId}});
      if(!advance)throw new Error("NOT_FOUND");
      if(advance.requestedBy===user.id)throw new Error("SELF_APPROVAL");
      if(!canTransitionExpense(advance.status as ExpenseAdvanceStatus,target))throw new Error("INVALID_TRANSITION");
      const moved=await tx.expenseAdvance.updateMany({where:{id,status:advance.status},data:{status:target,reviewerId:user.id,reviewedAt:new Date(),returnReason:decision==="return"?reason??null:null}});
      if(moved.count!==1)throw new Error("INVALID_TRANSITION");
      if(decision==="approve"&&!advance.expenseId){
        const expense=await tx.eventExpense.create({data:{eventId,label:`${advance.category}（立替：${advance.advancerName}）`,amount:advance.amount,note:`支払先：${advance.payee}`}});
        await tx.expenseAdvance.update({where:{id},data:{expenseId:expense.id}});
      }
      await tx.auditLog.create({data:{actorId:user.id,action:`EXPENSE_ADVANCE_${target}`,entityType:"ExpenseAdvance",entityId:id,before:{status:advance.status},after:{status:target,reason:reason??null}}});
    },serializable);
  }catch(error){code=errorCode(error)}
  return back(eventId,code.startsWith("expense_")?"notice":"error",code);
}
export async function cancelExpenseAdvance(eventId:string,formData:FormData){
  const {user,access}=await context(eventId);
  const id=String(formData.get("id")??"");
  if(isLocalDemo())return back(eventId,"notice","demo");
  let code="expense_cancelled";
  try{
    await db.$transaction(async tx=>{
      const advance=await tx.expenseAdvance.findFirst({where:{id,eventId}});
      if(!advance)throw new Error("NOT_FOUND");
      if(!(access.manager||advance.requestedBy===user.id))throw new Error("FORBIDDEN");
      if(!canTransitionExpense(advance.status as ExpenseAdvanceStatus,"CANCELLED"))throw new Error("INVALID_TRANSITION");
      await tx.expenseAdvance.update({where:{id},data:{status:"CANCELLED"}});
      await tx.auditLog.create({data:{actorId:user.id,action:"EXPENSE_ADVANCE_CANCELLED",entityType:"ExpenseAdvance",entityId:id,before:{status:advance.status}}});
    });
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="expense_cancelled"?"notice":"error",code);
}
export async function resubmitExpenseAdvance(eventId:string,formData:FormData){
  const {user,access}=await context(eventId);
  const id=String(formData.get("id")??"");
  const parsed=expenseSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  let code="expense_resubmitted";
  try{
    await db.$transaction(async tx=>{
      const advance=await tx.expenseAdvance.findFirst({where:{id,eventId}});
      if(!advance)throw new Error("NOT_FOUND");
      if(!(access.manager||advance.requestedBy===user.id))throw new Error("FORBIDDEN");
      if(!canTransitionExpense(advance.status as ExpenseAdvanceStatus,"REQUESTED"))throw new Error("INVALID_TRANSITION");
      const i=parsed.data;
      await tx.expenseAdvance.update({where:{id},data:{status:"REQUESTED",advancerName:i.advancerName,category:i.category,payee:i.payee,amount:i.amount,paidAt:jst(i.paidAt),evidenceNote:i.evidenceNote||null,returnReason:null,reviewerId:null,reviewedAt:null}});
      await tx.auditLog.create({data:{actorId:user.id,action:"EXPENSE_ADVANCE_RESUBMITTED",entityType:"ExpenseAdvance",entityId:id,before:{amount:advance.amount},after:{amount:i.amount}}});
    });
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="expense_resubmitted"?"notice":"error",code);
}
const settleSchema=z.object({id:z.string().min(1),amount:z.coerce.number().int().min(1).max(100_000_000),settledAt:day,method:method.default("BANK_TRANSFER"),note:z.string().trim().max(300).optional()});
export async function recordExpenseSettlement(eventId:string,formData:FormData){
  const {user,access}=await context(eventId);
  if(!access.approver)throw new Error("FORBIDDEN");
  const parsed=settleSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const i=parsed.data;let code="settlement_saved";
  try{
    await db.$transaction(async tx=>{
      const advance=await tx.expenseAdvance.findFirst({where:{id:i.id,eventId},include:{settlements:true}});
      if(!advance)throw new Error("NOT_FOUND");
      const settled=advance.settlements.reduce((n,s)=>n+s.amount,0);
      const next=settlementStatus(advance.amount,settled+i.amount);
      if(!canTransitionExpense(advance.status as ExpenseAdvanceStatus,next))throw new Error("INVALID_TRANSITION");
      if(i.amount>unsettled(advance.amount,settled))throw new Error("EXCEEDS_BALANCE");
      const settlement=await tx.expenseSettlement.create({data:{expenseAdvanceId:advance.id,amount:i.amount,settledAt:jst(i.settledAt),method:i.method,note:i.note||null,createdBy:user.id}});
      await tx.expenseAdvance.update({where:{id:advance.id},data:{status:next}});
      await tx.auditLog.create({data:{actorId:user.id,action:"EXPENSE_SETTLEMENT_RECORDED",entityType:"ExpenseSettlement",entityId:settlement.id,before:{status:advance.status},after:{amount:i.amount,status:next,expenseRecognizedOnce:true}}});
    },serializable);
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="settlement_saved"?"notice":"error",code);
}
