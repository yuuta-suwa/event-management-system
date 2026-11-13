"use server";
import {createHash,randomBytes} from "node:crypto";
import {redirect} from "next/navigation";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
import {buildSnapshot,loadReportRights} from "./build";
import {canCreate,canReview,canTransition,canViewKind,collectionScope} from "./domain";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;
const kinds=z.enum(["COLLECTION","PARTICIPANT","INTEGRATED"]);
const toList=(eventId:string,kind:"notice"|"error",code:string):never=>redirect(`/reports?event=${eventId}&${kind}=${code}`);
const toReport=(id:string,kind:"notice"|"error",code:string):never=>redirect(`/reports/${id}?${kind}=${code}`);

const draftSchema=z.object({eventId:z.string().min(1),kind:kinds});
/** 下書きの作成・更新(自動集計のプレビュー)。同じ人の未提出の下書きがあれば集計し直す。 */
export async function saveReportDraft(formData:FormData){
  const user=await requireUser(STAFF);
  const parsed=draftSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return redirect("/reports");
  const {eventId,kind}=parsed.data;
  if(isLocalDemo())return toList(eventId,"notice","demo");
  const ctx=await loadReportRights(user,eventId);
  if(!ctx||!canCreate(kind,ctx.rights))return toList(eventId,"error","forbidden");
  const snapshot=await buildSnapshot(eventId,kind,{reporterId:user.id,reporterName:user.name??"",rights:ctx.rights,scope:collectionScope(ctx.rights)});
  if(!snapshot)return toList(eventId,"error","not_found");
  const data={snapshot:snapshot as unknown as Prisma.InputJsonValue};
  const existing=await db.eventReport.findFirst({where:{eventId,kind,status:"DRAFT",createdBy:user.id}});
  if(existing){await db.eventReport.update({where:{id:existing.id},data});return toReport(existing.id,"notice","draft_saved")}
  for(let attempt=0;attempt<5;attempt++){
    const last=await db.eventReport.aggregate({where:{eventId,kind},_max:{version:true}});
    try{
      const report=await db.eventReport.create({data:{eventId,kind,version:(last._max.version??0)+1,createdBy:user.id,...data}});
      await db.auditLog.create({data:{actorId:user.id,action:"REPORT_DRAFT_CREATED",entityType:"EventReport",entityId:report.id,after:{eventId,kind,version:report.version}}});
      return toReport(report.id,"notice","draft_saved");
    }catch(error){if(!(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002"))throw error}
  }
  return toList(eventId,"error","conflict");
}

const idSchema=z.object({reportId:z.string().min(1),note:z.string().trim().max(500).optional()});
async function load(userId:string,role:string,reportId:string){
  const report=await db.eventReport.findUnique({where:{id:reportId}});
  if(!report)return null;
  const ctx=await loadReportRights({id:userId,role},report.eventId);
  return ctx?{report,...ctx}:null;
}
/** 提出: 提出時点で集計し直し、その結果をスナップショットとして固定する(以後は上書きしない)。 */
export async function submitReport(formData:FormData){
  const user=await requireUser(STAFF);
  const parsed=idSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return redirect("/reports");
  if(isLocalDemo())return redirect("/reports");
  const ctx=await load(user.id,user.role,parsed.data.reportId);
  if(!ctx)return redirect("/reports");
  const {report,rights}=ctx;
  if(report.createdBy!==user.id||!canViewKind(report.kind,rights))return toReport(report.id,"error","forbidden");
  if(!canTransition(report.status,"SUBMITTED"))return toReport(report.id,"error","not_allowed");
  const snapshot=await buildSnapshot(report.eventId,report.kind,{reporterId:user.id,reporterName:user.name??"",rights,scope:collectionScope(rights)});
  if(!snapshot)return toReport(report.id,"error","not_found");
  const changed=await db.eventReport.updateMany({where:{id:report.id,status:"DRAFT"},data:{status:"SUBMITTED",submittedAt:new Date(),snapshot:snapshot as unknown as Prisma.InputJsonValue}});
  if(changed.count!==1)return toReport(report.id,"error","not_allowed");
  await db.auditLog.create({data:{actorId:user.id,action:"REPORT_SUBMITTED",entityType:"EventReport",entityId:report.id,after:{eventId:report.eventId,kind:report.kind,version:report.version}}});
  return toReport(report.id,"notice","submitted");
}
async function review(formData:FormData,to:"UNDER_REVIEW"|"APPROVED"|"RETURNED"){
  const user=await requireUser(STAFF);
  const parsed=idSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return redirect("/reports");
  if(isLocalDemo())return redirect("/reports");
  const ctx=await load(user.id,user.role,parsed.data.reportId);
  if(!ctx)return redirect("/reports");
  const {report,rights}=ctx;
  if(!canReview(report.kind,rights,user.id,report.createdBy))return toReport(report.id,"error","forbidden");
  if(!canTransition(report.status,to))return toReport(report.id,"error","not_allowed");
  if(to==="RETURNED"&&!parsed.data.note)return toReport(report.id,"error","note_required");
  const changed=await db.eventReport.updateMany({where:{id:report.id,status:report.status},data:{status:to,reviewedBy:user.id,reviewedAt:new Date(),reviewNote:parsed.data.note||null}});
  if(changed.count!==1)return toReport(report.id,"error","not_allowed");
  await db.auditLog.create({data:{actorId:user.id,action:to==="APPROVED"?"REPORT_APPROVED":to==="RETURNED"?"REPORT_RETURNED":"REPORT_REVIEW_STARTED",entityType:"EventReport",entityId:report.id,before:{status:report.status},after:{status:to,note:parsed.data.note||null}}});
  return toReport(report.id,"notice",to.toLowerCase());
}
export async function startReportReview(formData:FormData){return review(formData,"UNDER_REVIEW")}
export async function approveReport(formData:FormData){return review(formData,"APPROVED")}
export async function returnReport(formData:FormData){return review(formData,"RETURNED")}

/** 差戻し後の再提出: 差戻された報告は残したまま、新しい版(下書き)を作る。 */
export async function reviseReport(formData:FormData){
  const user=await requireUser(STAFF);
  const parsed=idSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return redirect("/reports");
  if(isLocalDemo())return redirect("/reports");
  const ctx=await load(user.id,user.role,parsed.data.reportId);
  if(!ctx)return redirect("/reports");
  const {report,rights}=ctx;
  if(report.status!=="RETURNED"||!canCreate(report.kind,rights))return toReport(report.id,"error","not_allowed");
  const snapshot=await buildSnapshot(report.eventId,report.kind,{reporterId:user.id,reporterName:user.name??"",rights,scope:collectionScope(rights)});
  if(!snapshot)return toReport(report.id,"error","not_found");
  for(let attempt=0;attempt<5;attempt++){
    const last=await db.eventReport.aggregate({where:{eventId:report.eventId,kind:report.kind},_max:{version:true}});
    try{
      const next=await db.eventReport.create({data:{eventId:report.eventId,kind:report.kind,version:(last._max.version??0)+1,createdBy:user.id,snapshot:snapshot as unknown as Prisma.InputJsonValue}});
      await db.auditLog.create({data:{actorId:user.id,action:"REPORT_REVISED",entityType:"EventReport",entityId:next.id,after:{from:report.id,version:next.version}}});
      return toReport(next.id,"notice","draft_saved");
    }catch(error){if(!(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002"))throw error}
  }
  return toReport(report.id,"error","conflict");
}

const shareSchema=z.object({reportId:z.string().min(1),channel:z.enum(["LINE","LINK"]).default("LINK"),hours:z.coerce.number().int().min(1).max(168).default(72)});
/** 権限付きの閲覧リンク(期限つき)。リンク先でもログインと閲覧権限をサーバー側で確認するため、リンクを知っているだけでは見られない。 */
export async function createReportShare(formData:FormData){
  const user=await requireUser(STAFF);
  const parsed=shareSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return redirect("/reports");
  if(isLocalDemo())return redirect("/reports");
  const ctx=await load(user.id,user.role,parsed.data.reportId);
  if(!ctx)return redirect("/reports");
  const {report,rights}=ctx;
  if(!canViewKind(report.kind,rights))return toReport(report.id,"error","forbidden");
  if(report.status==="DRAFT")return toReport(report.id,"error","not_submitted");
  const token=randomBytes(24).toString("base64url");
  await db.reportShare.create({data:{reportId:report.id,tokenHash:createHash("sha256").update(token).digest("hex"),channel:parsed.data.channel,expiresAt:new Date(Date.now()+parsed.data.hours*3600_000),createdBy:user.id}});
  await db.auditLog.create({data:{actorId:user.id,action:"REPORT_SHARED",entityType:"EventReport",entityId:report.id,after:{channel:parsed.data.channel,hours:parsed.data.hours}}});
  return redirect(`/reports/${report.id}?notice=shared&share=${token}`);
}
