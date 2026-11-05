import {timingSafeEqual} from "node:crypto";
import {NextResponse} from "next/server";
import {createReminderJobs,processDueNotificationJobs} from "@/features/notifications/service";
import {isLocalDemo} from "@/server/authz";
export const dynamic="force-dynamic";
function bearerMatches(header:string|null,secret:string|undefined){
  if(!secret||secret.length<16||!header)return false;
  const expected=Buffer.from(`Bearer ${secret}`);
  const actual=Buffer.from(header);
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
function authorized(request:Request){
  const header=request.headers.get("authorization");
  // POST: 外部スケジューラ用(NOTIFICATION_JOB_SECRET)。GET: Vercel Cron用(CRON_SECRET または NOTIFICATION_JOB_SECRET)
  return bearerMatches(header,process.env.NOTIFICATION_JOB_SECRET)||bearerMatches(header,process.env.CRON_SECRET);
}
async function run(request:Request){
  if(!authorized(request))return NextResponse.json({error:"UNAUTHORIZED"},{status:401,headers:{"Cache-Control":"no-store"}});
  if(isLocalDemo())return NextResponse.json({scheduled:0,processed:0,sent:0,failed:0,demo:true});
  const scheduled=await createReminderJobs();
  const result=await processDueNotificationJobs();
  return NextResponse.json({scheduled,...result},{headers:{"Cache-Control":"no-store"}});
}
export const POST=run;
// Vercel Cron は GET で呼び出す。認証(Bearer)は POST と同一で、未認証は 401。
export const GET=run;
