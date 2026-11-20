import {after} from "next/server";
import {db} from "@/server/db";
import {emailConfigured,sendMail} from "@/features/email/provider";
import {pushLineMessage} from "@/features/notifications/line";
import {DEFAULT_PREF,buildRegistrationNotice,channelsFor,dedupeKey,pickRecipients,type Channel,type Pref} from "./domain";
const origin=()=>process.env.NEXT_PUBLIC_APP_URL??"http://127.0.0.1:3000";

type Notice=ReturnType<typeof buildRegistrationNotice>;
async function deliver(channel:Channel,to:{email:string;lineUserId:string|null},notice:Notice):Promise<{status:"SENT"|"FAILED"|"SKIPPED";error?:string}>{
  if(channel==="EMAIL"){
    if(!emailConfigured())return {status:"SKIPPED",error:"メール送信が未設定です（RESEND_API_KEY / EMAIL_FROM）"};
    const r=await sendMail({to:to.email,subject:notice.subject,text:notice.text,html:notice.html});
    return r.ok?{status:"SENT"}:{status:"FAILED",error:r.error};
  }
  if(!to.lineUserId)return {status:"SKIPPED",error:"LINEの宛先が未登録です"};
  try{await pushLineMessage(to.lineUserId,notice.lineText);return {status:"SENT"}}
  catch(e){return {status:"FAILED",error:(e instanceof Error?e.message:"UNKNOWN").slice(0,200)}}
}

/** 参加登録を管理者へ通知する。失敗しても申込の成否には影響しない(例外は投げない)。登録×宛先×チャネルごとに1回だけ送る。 */
export async function notifyAdminsOfRegistration(registrationId:string,quantity=1){
  try{
    const reg=await db.eventRegistration.findUnique({where:{id:registrationId},select:{id:true,eventId:true,event:{select:{name:true,capacity:true,managerId:true}}}});
    if(!reg)return {sent:0,failed:0,skipped:0};
    const [users,total,paid]=await Promise.all([
      db.user.findMany({where:{role:{in:["SUPER_ADMIN","EVENT_MANAGER"]},status:"ACTIVE"},select:{id:true,email:true,role:true,status:true,adminNotificationPref:true}}),
      db.eventRegistration.count({where:{eventId:reg.eventId,attendanceStatus:{not:"CANCELLED"}}}),
      db.eventRegistration.count({where:{eventId:reg.eventId,attendanceStatus:{not:"CANCELLED"},ticket:{paymentStatus:"PAID"}}}),
    ]);
    const notice=buildRegistrationNotice({eventName:reg.event.name,quantity,total,paid,capacity:reg.event.capacity,rosterUrl:`${origin()}/participants`});
    const ids=new Set(pickRecipients(users,reg.event));
    const out={sent:0,failed:0,skipped:0};
    const lineTargets=new Set<string>();// 同じLINEに二重に送らないための記録(管理者本人の設定と、追加された宛先が同じ人の場合)
    for(const u of users){
      if(!ids.has(u.id))continue;
      const pref:Pref=u.adminNotificationPref??DEFAULT_PREF;
      for(const channel of channelsFor(pref)){
        if(channel==="LINE"&&pref.lineUserId)lineTargets.add(pref.lineUserId);
        // 先に記録を作り(重複なら何もしない)、送信結果で更新する
        const claimed=await db.adminNotificationLog.createMany({data:[{eventId:reg.eventId,registrationId:reg.id,userId:u.id,channel,dedupeKey:dedupeKey(reg.id,u.id,channel)}],skipDuplicates:true});
        if(claimed.count!==1)continue;
        const r=await deliver(channel,{email:u.email,lineUserId:pref.lineUserId},notice);
        await db.adminNotificationLog.update({where:{dedupeKey:dedupeKey(reg.id,u.id,channel)},data:{status:r.status,error:r.error??null}});
        out[r.status==="SENT"?"sent":r.status==="FAILED"?"failed":"skipped"]++;
      }
    }
    // 管理者が追加した宛先(LINE連携済みの参加者)。全イベントの通知を受け取る。LINEは送信時に現在の連携から引く。
    const extra=await db.adminNotificationRecipient.findMany({where:{active:true},select:{id:true,participant:{select:{lineUserId:true,lineConnected:true}}}});
    for(const r of extra){
      const lineUserId=r.participant.lineConnected?r.participant.lineUserId:null;
      if(lineUserId&&lineTargets.has(lineUserId))continue;
      const key=dedupeKey(reg.id,`recipient:${r.id}`,"LINE");
      const claimed=await db.adminNotificationLog.createMany({data:[{eventId:reg.eventId,registrationId:reg.id,userId:`recipient:${r.id}`,channel:"LINE",dedupeKey:key}],skipDuplicates:true});
      if(claimed.count!==1)continue;
      const res=lineUserId?await deliver("LINE",{email:"",lineUserId},notice):{status:"SKIPPED" as const,error:"LINE連携が解除されているため送れません"};
      await db.adminNotificationLog.update({where:{dedupeKey:key},data:{status:res.status,error:res.error??null}});
      out[res.status==="SENT"?"sent":res.status==="FAILED"?"failed":"skipped"]++;
    }
    return out;
  }catch(e){console.error("notifyAdminsOfRegistration failed",e);return {sent:0,failed:0,skipped:0}}
}
/** レスポンスを返したあとにバックグラウンドで通知する(申込画面を待たせない)。リクエスト外では何もしない。 */
export function kickAdminRegistrationNotice(registrationId:string,quantity:number){
  try{after(async()=>{await notifyAdminsOfRegistration(registrationId,quantity)})}catch{/* request scope なし */}
}
/** 設定画面の「テスト通知」: 自分宛てに、実際の通知と同じ形式の文面を送る(記録は残すが二重送信防止の対象外)。 */
export async function sendTestNotice(userId:string){
  const u=await db.user.findUnique({where:{id:userId},select:{id:true,email:true,adminNotificationPref:true}});
  if(!u)return [];
  const pref:Pref=u.adminNotificationPref??DEFAULT_PREF;
  const notice=buildRegistrationNotice({eventName:"（テスト）サンプルイベント",quantity:1,total:12,paid:8,capacity:50,rosterUrl:`${origin()}/participants`});
  notice.subject=`【テスト】${notice.subject}`;
  const results:{channel:Channel;status:string;error?:string}[]=[];
  for(const channel of channelsFor(pref)){
    const r=await deliver(channel,{email:u.email,lineUserId:pref.lineUserId},{...notice,lineText:`【テスト】\n${notice.lineText}`});
    await db.adminNotificationLog.create({data:{eventId:"test",userId:u.id,channel,status:r.status,error:r.error??null,dedupeKey:`ADMIN_TEST:${u.id}:${channel}:${Date.now()}`}});
    results.push({channel,...r});
  }
  return results;
}

/** 追加した宛先への「テスト通知」(管理者が、その人のLINEに実際と同じ形式で1通送る)。 */
export async function sendRecipientTestNotice(recipientId:string){
  const r=await db.adminNotificationRecipient.findUnique({where:{id:recipientId},select:{id:true,participant:{select:{lineUserId:true,lineConnected:true}}}});
  if(!r)return {status:"SKIPPED" as const,error:"宛先が見つかりません"};
  const lineUserId=r.participant.lineConnected?r.participant.lineUserId:null;
  const notice=buildRegistrationNotice({eventName:"（テスト）サンプルイベント",quantity:1,total:12,paid:8,capacity:50,rosterUrl:`${origin()}/participants`});
  const res=lineUserId?await deliver("LINE",{email:"",lineUserId},{...notice,lineText:`【テスト】\n${notice.lineText}`}):{status:"SKIPPED" as const,error:"LINE連携が解除されているため送れません"};
  await db.adminNotificationLog.create({data:{eventId:"test",userId:`recipient:${r.id}`,channel:"LINE",status:res.status,error:res.error??null,dedupeKey:`ADMIN_TEST:recipient:${r.id}:${Date.now()}`}});
  return res;
}
