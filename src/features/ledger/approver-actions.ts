"use server";
import {redirect} from "next/navigation";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
import {canCompleteApproverChange,checkApproverRequest} from "./approver-domain";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;
const back=(eventId:string,kind:"notice"|"error",code:string):never=>redirect(`/events/${eventId}/approver?${kind}=${code}`);
const serializable={isolationLevel:Prisma.TransactionIsolationLevel.Serializable};
const known=["FORBIDDEN","NOT_FOUND","NOT_PENDING","PENDING_REMITTANCES","ALREADY_PENDING","INVALID_NEW","SELF_PROMOTION","NEEDS_CURRENT","BAD_CURRENT","SAME","EMERGENCY_NOT_NEEDED","ALREADY_CONFIRMED","APPROVER_CHANGED"];
function errorCode(error:unknown){
  if(error instanceof Error&&known.includes(error.message))return error.message.toLowerCase();
  if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2034")return "conflict";
  throw error;
}
const requestSchema=z.object({newApproverId:z.string().min(1),currentApproverId:z.string().optional(),reason:z.string().trim().min(3).max(300),emergency:z.string().optional()});
/** 決裁権者の指定・変更の申請。通常は現決裁権者と新決裁権者の双方の確認、緊急時は新決裁権者の確認+SUPER_ADMIN2名の承認が必要。 */
export async function requestApproverChange(eventId:string,formData:FormData){
  const actor=await requireUser(STAFF);
  const parsed=requestSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  const i=parsed.data;const emergency=i.emergency==="on";let code="requested";
  try{
    await db.$transaction(async tx=>{
      const event=await tx.event.findUnique({where:{id:eventId},select:{id:true}});
      if(!event)throw new Error("NOT_FOUND");
      const current=(await tx.eventRoleAssignment.findMany({where:{eventId,role:"APPROVER",active:true},select:{userId:true}})).map(a=>a.userId);
      const newApprover=await tx.user.findUnique({where:{id:i.newApproverId},select:{id:true,role:true,status:true}});
      const check=checkApproverRequest({actor:{id:actor.id,role:actor.role},newApprover,currentApproverIds:current,currentApproverId:i.currentApproverId||null,emergency});
      if(check!=="OK")throw new Error(check);
      if(await tx.approverChangeRequest.findFirst({where:{eventId,status:"PENDING"}}))throw new Error("ALREADY_PENDING");
      const now=new Date();
      const currentId=current.length>0?i.currentApproverId!:null;
      const req=await tx.approverChangeRequest.create({data:{eventId,currentApproverId:currentId,newApproverId:i.newApproverId,requestedBy:actor.id,emergency,reason:i.reason,
        currentConfirmedAt:currentId===null||currentId===actor.id?now:null,newConfirmedAt:actor.id===i.newApproverId?now:null}});
      if(emergency)await tx.approverChangeApproval.create({data:{requestId:req.id,userId:actor.id}});
      await tx.auditLog.create({data:{actorId:actor.id,action:"APPROVER_CHANGE_REQUESTED",entityType:"ApproverChangeRequest",entityId:req.id,after:{eventId,currentApproverId:currentId,newApproverId:i.newApproverId,emergency}}});
      if(await tryComplete(tx,req.id,actor.id))code="completed";
    },serializable);
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="requested"||code==="completed"?"notice":"error",code);
}
type Tx=Prisma.TransactionClient;
async function tryComplete(tx:Tx,requestId:string,actorId:string){
  const req=await tx.approverChangeRequest.findUniqueOrThrow({where:{id:requestId},include:{approvals:true}});
  if(req.status!=="PENDING")return false;
  if(!canCompleteApproverChange({emergency:req.emergency,currentApproverId:req.currentApproverId,newApproverId:req.newApproverId,currentConfirmed:Boolean(req.currentConfirmedAt),newConfirmed:Boolean(req.newConfirmedAt),approvals:req.approvals}))return false;
  if(req.currentApproverId){
    // 旧決裁権者宛ての未完了の送金が残る間は交代できない(宛先不明の送金を防ぐ)
    const pending=await tx.remittance.count({where:{eventId:req.eventId,recipientId:req.currentApproverId,status:{in:["PLANNED","SENT_REPORTED","DISCREPANCY"]}}});
    if(pending>0)throw new Error("PENDING_REMITTANCES");
    await tx.eventRoleAssignment.updateMany({where:{eventId:req.eventId,userId:req.currentApproverId,role:"APPROVER",active:true},data:{active:false,revokedAt:new Date()}});
  }
  await tx.eventRoleAssignment.upsert({where:{eventId_userId_role:{eventId:req.eventId,userId:req.newApproverId,role:"APPROVER"}},update:{active:true,revokedAt:null,assignedBy:actorId},create:{eventId:req.eventId,userId:req.newApproverId,role:"APPROVER",assignedBy:actorId}});
  await tx.approverChangeRequest.update({where:{id:req.id},data:{status:"COMPLETED",completedAt:new Date()}});
  await tx.auditLog.create({data:{actorId,action:"APPROVER_CHANGED",entityType:"ApproverChangeRequest",entityId:req.id,before:{approverId:req.currentApproverId},after:{eventId:req.eventId,approverId:req.newApproverId,emergency:req.emergency}}});
  return true;
}
const idSchema=z.object({requestId:z.string().min(1)});
/** 申請への確認・承認。操作者が新決裁権者本人なら本人確認、現決裁権者なら現決裁権者の確認、緊急時のSUPER_ADMINなら承認として記録する。 */
export async function confirmApproverChange(eventId:string,formData:FormData){
  const actor=await requireUser(STAFF);
  const parsed=idSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  let code="confirmed";
  try{
    await db.$transaction(async tx=>{
      const req=await tx.approverChangeRequest.findFirst({where:{id:parsed.data.requestId,eventId},include:{approvals:true}});
      if(!req)throw new Error("NOT_FOUND");
      if(req.status!=="PENDING")throw new Error("NOT_PENDING");
      const now=new Date();let acted=false;
      if(actor.id===req.newApproverId){
        if(req.newConfirmedAt)throw new Error("ALREADY_CONFIRMED");
        await tx.approverChangeRequest.update({where:{id:req.id},data:{newConfirmedAt:now}});acted=true;
      }else if(actor.id===req.currentApproverId){
        if(req.currentConfirmedAt)throw new Error("ALREADY_CONFIRMED");
        await tx.approverChangeRequest.update({where:{id:req.id},data:{currentConfirmedAt:now}});acted=true;
      }else if(req.emergency&&actor.role==="SUPER_ADMIN"){
        if(req.approvals.some(a=>a.userId===actor.id))throw new Error("ALREADY_CONFIRMED");
        await tx.approverChangeApproval.create({data:{requestId:req.id,userId:actor.id}});acted=true;
      }
      if(!acted)throw new Error("FORBIDDEN");
      await tx.auditLog.create({data:{actorId:actor.id,action:"APPROVER_CHANGE_CONFIRMED",entityType:"ApproverChangeRequest",entityId:req.id,after:{eventId}}});
      if(await tryComplete(tx,req.id,actor.id))code="completed";
    },serializable);
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="confirmed"||code==="completed"?"notice":"error",code);
}
/** 申請の取消・拒否: 申請者、現決裁権者、新決裁権者のいずれか(緊急申請はSUPER_ADMINも)が行える。 */
export async function cancelApproverChange(eventId:string,formData:FormData){
  const actor=await requireUser(STAFF);
  const parsed=idSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back(eventId,"error","invalid");
  if(isLocalDemo())return back(eventId,"notice","demo");
  let code="cancelled";
  try{
    await db.$transaction(async tx=>{
      const req=await tx.approverChangeRequest.findFirst({where:{id:parsed.data.requestId,eventId}});
      if(!req)throw new Error("NOT_FOUND");
      if(![req.requestedBy,req.currentApproverId,req.newApproverId].includes(actor.id)&&!(req.emergency&&actor.role==="SUPER_ADMIN"))throw new Error("FORBIDDEN");
      const changed=await tx.approverChangeRequest.updateMany({where:{id:req.id,status:"PENDING"},data:{status:"CANCELLED",closedBy:actor.id}});
      if(changed.count!==1)throw new Error("NOT_PENDING");
      await tx.auditLog.create({data:{actorId:actor.id,action:"APPROVER_CHANGE_CANCELLED",entityType:"ApproverChangeRequest",entityId:req.id,after:{eventId}}});
    },serializable);
  }catch(error){code=errorCode(error)}
  return back(eventId,code==="cancelled"?"notice":"error",code);
}
