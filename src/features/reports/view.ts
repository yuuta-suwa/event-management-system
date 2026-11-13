import {db} from "@/server/db";
import {loadReportRights} from "./build";
import {canReview,canViewKind,type ReportKind,type ReportStatus,type Snapshot} from "./domain";
/** 報告書の閲覧可否をサーバー側で判定する(画面・印刷・共有リンクの全入口で使う)。 */
export async function authorizeReportView(user:{id:string;role:string},reportId:string){
  const report=await db.eventReport.findUnique({where:{id:reportId}});
  if(!report)return null;
  const ctx=await loadReportRights(user,report.eventId);
  if(!ctx||!canViewKind(report.kind,ctx.rights))return null;
  const names=new Map((await db.user.findMany({where:{id:{in:[report.createdBy,...(report.reviewedBy?[report.reviewedBy]:[])]}},select:{id:true,name:true}})).map(u=>[u.id,u.name]));
  return {report:{...report,kind:report.kind as ReportKind,status:report.status as ReportStatus,snapshot:report.snapshot as unknown as Snapshot},rights:ctx.rights,event:ctx.event,creatorName:names.get(report.createdBy)??"",reviewerName:report.reviewedBy?names.get(report.reviewedBy)??"":"",mayReview:canReview(report.kind,ctx.rights,user.id,report.createdBy),isCreator:report.createdBy===user.id};
}
