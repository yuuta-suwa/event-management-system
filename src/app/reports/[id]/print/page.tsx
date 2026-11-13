import {notFound} from "next/navigation";
import {requireUser} from "@/server/authz";
import {db} from "@/server/db";
import {authorizeReportView} from "@/features/reports/view";
import {kindLabel,statusLabel,type Snapshot} from "@/features/reports/domain";
import {ReportBody} from "@/features/reports/report-body";
import {PrintButton} from "@/features/reports/print-button";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;
export const dynamic="force-dynamic";
/** A4縦の印刷用ページ。ブラウザの「PDFとして保存」でPDFにできる。閲覧権限はサーバー側で確認し、閲覧を監査ログに残す。 */
export default async function ReportPrintPage({params}:{params:Promise<{id:string}>}){
  const user=await requireUser(STAFF);
  const {id}=await params;
  const view=await authorizeReportView(user,id);
  if(!view||view.report.status==="DRAFT")notFound();
  await db.auditLog.create({data:{actorId:user.id,action:"REPORT_PDF_VIEWED",entityType:"EventReport",entityId:id,after:{version:view.report.version}}});
  const {report}=view;
  return <main className="report-print">
    <PrintButton/>
    <header><h1>{kindLabel[report.kind]}</h1><p>{view.event.name}　v{report.version}　／　承認状態：{statusLabel[report.status]}{view.reviewerName&&`（${view.reviewerName}）`}</p><p>報告者：{view.creatorName}　作成：{report.createdAt.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})}</p></header>
    <ReportBody s={report.snapshot as Snapshot}/>
  </main>;
}
