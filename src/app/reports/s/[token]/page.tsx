import {createHash} from "node:crypto";
import {notFound,redirect} from "next/navigation";
import {requireUser} from "@/server/authz";
import {db} from "@/server/db";
import {authorizeReportView} from "@/features/reports/view";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;
export const dynamic="force-dynamic";
/** 共有リンク: 期限・失効を確認し、ログイン済みで閲覧権限のある人だけを報告書へ案内する。 */
export default async function ReportShareEntry({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  const user=await requireUser(STAFF);
  const share=await db.reportShare.findUnique({where:{tokenHash:createHash("sha256").update(token).digest("hex")}});
  if(!share||share.revokedAt||share.expiresAt<=new Date())notFound();
  if(!await authorizeReportView(user,share.reportId))notFound();
  redirect(`/reports/${share.reportId}`);
}
