import QRCode from "qrcode";
import {after} from "next/server";
import type {Prisma} from "@prisma/client";
import {db} from "@/server/db";
import {hashTicketToken,issueTicketToken,qrTokenSecret} from "@/features/tickets/token";
import {issueRegistrationToken} from "@/features/participants/registration-token";
import {ensureReceptionCode} from "@/features/checkins/reception-code";
import {MAX_ATTEMPTS,RESEND_LIMIT_PER_DAY,autoDedupeKey,buildTicketEmail,canResend,ticketIsDeliverable,type EmailKind} from "./domain";
import {emailConfigured,sendMail} from "./provider";

type Client=Prisma.TransactionClient|typeof db;
const appOrigin=()=>process.env.NEXT_PUBLIC_APP_URL??"http://127.0.0.1:3000";

/** 送信予定を記録する(送信は別処理)。受取人が未確定のチケット(配布前)には作らない。 */
export async function queueTicketEmail(client:Client,input:{kind:EmailKind;ticketId:string;triggeredBy?:string|null}){
  const ticket=await client.ticket.findUnique({where:{id:input.ticketId},include:{participant:{select:{id:true,email:true}}}});
  if(!ticket||!ticket.claimed||ticket.status==="CANCELLED")return false;
  const result=await client.emailLog.createMany({data:[{eventId:ticket.eventId,ticketId:ticket.id,participantId:ticket.participantId,kind:input.kind,toEmail:ticket.participant.email.toLowerCase(),subject:input.kind,dedupeKey:autoDedupeKey(input.kind,ticket.id,ticket.participantId,ticket.qrTokenVersion),triggeredBy:input.triggeredBy??null}],skipDuplicates:true});
  return result.count===1;
}
/** レスポンス後にバックグラウンドで送信を試みる。リクエスト外(テスト等)では何もせず、定期ジョブが拾う。 */
export function kickEmailDelivery(){try{after(async()=>{await deliverPendingEmails(10)})}catch{/* request scope なし */}}

export async function deliverPendingEmails(limit=30){
  const rows=await db.emailLog.findMany({where:{status:"PENDING"},orderBy:{createdAt:"asc"},take:limit});
  const out={sent:0,failed:0,skipped:0,retry:0};
  for(const row of rows){const r=await deliverEmail(row.id);if(r)out[r]++}
  return out;
}

type Outcome="sent"|"failed"|"skipped"|"retry";
export async function deliverEmail(logId:string):Promise<Outcome|null>{
  const log=await db.emailLog.findUnique({where:{id:logId}});
  if(!log||log.status!=="PENDING")return null;
  // 同時実行の防止: attempt を比較して更新できた1つの処理だけが送信する
  const claimed=await db.emailLog.updateMany({where:{id:log.id,status:"PENDING",attempt:log.attempt},data:{attempt:{increment:1}}});
  if(claimed.count!==1)return null;
  const attempt=log.attempt+1;
  const finish=async(status:"SENT"|"FAILED"|"SKIPPED"|"PENDING",data:{error?:string|null;providerId?:string|null;subject?:string}):Promise<Outcome>=>{
    await db.emailLog.update({where:{id:log.id},data:{status,errorMessage:data.error??null,providerMessageId:data.providerId??null,...(data.subject?{subject:data.subject}:{}),...(status==="SENT"?{sentAt:new Date(),provider:"resend"}:{})}});
    await db.auditLog.create({data:{actorId:log.triggeredBy,action:status==="SENT"?"EMAIL_SENT":status==="SKIPPED"?"EMAIL_SKIPPED":"EMAIL_FAILED",entityType:"EmailLog",entityId:log.id,after:{kind:log.kind,ticketId:log.ticketId,status,attempt}}});
    return status==="SENT"?"sent":status==="SKIPPED"?"skipped":status==="FAILED"?"failed":"retry";
  };
  if(!emailConfigured())return finish("SKIPPED",{error:"メール送信が未設定です（RESEND_API_KEY / EMAIL_FROM）"});
  const ticket=log.ticketId?await db.ticket.findUnique({where:{id:log.ticketId},include:{participant:true,event:true,registration:{select:{id:true}}}}):null;
  if(!ticket)return finish("SKIPPED",{error:"チケットが見つかりません"});
  // 送信時点の状態を再確認する: 保有者が替わった・取消された場合は送らない
  if(!ticket.claimed||ticket.participantId!==log.participantId)return finish("SKIPPED",{error:"保有者が変更されたため送信しません"});
  if(ticket.status==="CANCELLED"||ticket.paymentStatus==="CANCELLED"||ticket.paymentStatus==="REFUNDED")return finish("SKIPPED",{error:"取消済みのチケットです"});
  const secret=qrTokenSecret();
  const token=issueTicketToken(ticket.id,ticket.qrTokenVersion,secret);
  const qrWanted=log.kind!=="REGISTRATION_COMPLETE";
  const qrValid=qrWanted&&ticketIsDeliverable(ticket)&&hashTicketToken(token)===ticket.qrTokenHash;// 失効済みQRは絶対に送らない
  if(log.kind==="TICKET_ACTIVATED"&&!qrValid)return finish("SKIPPED",{error:"有効なQRチケットではないため送信しません"});
  const registrationId=ticket.registration?.id??(await db.eventRegistration.findFirst({where:{eventId:ticket.eventId,participantId:ticket.participantId},select:{id:true}}))?.id;
  if(!registrationId)return finish("SKIPPED",{error:"参加登録が見つかりません"});
  const receptionCode=qrValid?await ensureReceptionCode(ticket.id):null;
  const origin=appOrigin();
  const mail=buildTicketEmail({kind:log.kind as EmailKind,participantName:ticket.participant.name,eventName:ticket.event.name,startTime:ticket.event.startTime,endTime:ticket.event.endTime,venueName:ticket.event.venueName,address:ticket.event.address,ticketNumber:ticket.ticketNumber,myPageUrl:`${origin}/my/${issueRegistrationToken(registrationId,secret)}`,ticketUrl:qrValid?`${origin}/ticket/${token}`:null,receptionCode,organizer:ticket.event.organizer,contact:process.env.CONTACT_EMAIL??null});
  const attachments=qrValid?[{filename:`ticket-${ticket.ticketNumber}.png`,contentBase64:(await QRCode.toBuffer(`${origin}/checkin?token=${encodeURIComponent(token)}`,{width:480,margin:2,errorCorrectionLevel:"M"})).toString("base64")}]:undefined;
  const result=await sendMail({to:log.toEmail,subject:mail.subject,text:mail.text,html:mail.html,attachments});
  if(result.ok)return finish("SENT",{providerId:result.id,subject:mail.subject});
  if(result.retryable&&attempt<MAX_ATTEMPTS)return finish("PENDING",{error:result.error,subject:mail.subject});
  return finish("FAILED",{error:result.error,subject:mail.subject});
}

/** 再送(管理者・本人)。1チケットあたり24時間に3回まで。 */
export async function resendTicketEmail(ticketId:string,actor:{id:string|null}){
  const ticket=await db.ticket.findUnique({where:{id:ticketId},include:{participant:{select:{email:true}}}});
  if(!ticket||!ticket.claimed||ticket.status==="CANCELLED")return {ok:false as const,code:"not_resendable"};
  const since=new Date(Date.now()-24*60*60*1000);
  const used=await db.emailLog.count({where:{ticketId,kind:"MANUAL_RESEND",createdAt:{gte:since}}});
  if(!canResend(used))return {ok:false as const,code:"rate_limited",limit:RESEND_LIMIT_PER_DAY};
  const log=await db.emailLog.create({data:{eventId:ticket.eventId,ticketId,participantId:ticket.participantId,kind:"MANUAL_RESEND",toEmail:ticket.participant.email.toLowerCase(),subject:"MANUAL_RESEND",triggeredBy:actor.id}});
  await db.auditLog.create({data:{actorId:actor.id,action:"EMAIL_RESEND_REQUESTED",entityType:"EmailLog",entityId:log.id,after:{ticketId}}});
  const outcome=await deliverEmail(log.id);
  return {ok:true as const,code:outcome??"queued",logId:log.id};
}
/** 失敗したメールの再試行(管理者)。 */
export async function retryFailedEmail(logId:string,actorId:string){
  const log=await db.emailLog.findUnique({where:{id:logId}});
  if(!log||log.status!=="FAILED"||!log.ticketId)return {ok:false as const,code:"not_failed"};
  return resendTicketEmail(log.ticketId,{id:actorId});
}
