"use server";
import {redirect} from "next/navigation";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
import {sendTestNotice} from "./service";
const ROLES=["SUPER_ADMIN","EVENT_MANAGER"] as const;
const schema=z.object({registrationEmail:z.string().optional(),registrationLine:z.string().optional(),lineUserId:z.string().trim().regex(/^U[0-9a-f]{32}$/i,"LINEユーザーIDの形式が正しくありません").optional().or(z.literal(""))});
const back=(kind:"notice"|"error",code:string):never=>redirect(`/settings/notifications?${kind}=${code}`);
/** 自分の通知設定を保存する(他の人の設定は変更できない)。 */
export async function saveAdminNotificationPref(formData:FormData){
  const user=await requireUser(ROLES);
  const parsed=schema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back("error","invalid_line_id");
  if(isLocalDemo())return back("notice","demo");
  const i=parsed.data;const lineUserId=i.lineUserId||null;const line=i.registrationLine==="on";
  if(line&&!lineUserId)return back("error","line_needs_id");
  await db.adminNotificationPref.upsert({where:{userId:user.id},create:{userId:user.id,registrationEmail:i.registrationEmail==="on",registrationLine:line,lineUserId},update:{registrationEmail:i.registrationEmail==="on",registrationLine:line,lineUserId}});
  await db.auditLog.create({data:{actorId:user.id,action:"ADMIN_NOTIFICATION_PREF_UPDATED",entityType:"User",entityId:user.id,after:{email:i.registrationEmail==="on",line}}});
  return back("notice","saved");
}
/** 自分宛てにテスト通知を送る。 */
export async function sendAdminTestNotice(){
  const user=await requireUser(ROLES);
  if(isLocalDemo())return back("notice","demo");
  const results=await sendTestNotice(user.id);
  if(results.length===0)return back("error","no_channel");
  const failed=results.some(r=>r.status==="FAILED");const skipped=results.some(r=>r.status==="SKIPPED");
  return back(failed?"error":skipped?"error":"notice",failed?"test_failed":skipped?"test_skipped":"test_sent");
}
