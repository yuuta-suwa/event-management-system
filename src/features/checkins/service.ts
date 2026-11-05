import {randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import type {UserRole} from "@prisma/client";
import {db} from "@/server/db";
import {isLocalDemo} from "@/server/authz";
import {canAccessEvent} from "@/server/permissions";
import {hashTicketToken,verifyTicketToken} from "@/features/tickets/token";
import {decideCheckinGate} from "./domain";
import {CODE_FAILURE_LIMIT,normalizeReceptionCode,recentCodeFailures,recordCodeFailure} from "./reception-code";

export type UnpaidResolution="ONSITE_PAYMENT"|"REJECT"|"ADMIN_CONFIRMATION";
export type CheckinMethod="QR"|"RECEPTION_CODE"|"NAME_SEARCH";
export type Verification="SELF_DECLARED"|"ID_DOCUMENT"|"PHONE_LAST4";
export type CheckinResult={kind:"OK"|"ALREADY_CHECKED_IN"|"UNPAID"|"REJECTED"|"NEEDS_ADMIN"|"INVALID"|"WRONG_EVENT"|"FORBIDDEN"|"LOCKED"|"VERIFY_REQUIRED";participantName?:string;eventName?:string;ticketNumber?:string;checkedInAt?:string;checkedInBy?:string;ticketId?:string;message:string};
export type Operator={id:string;name:string;role:UserRole};
const demoState=globalThis as unknown as{demoCheckins?:Map<string,{at:string;by:string}>};demoState.demoCheckins??=new Map();

const ticketInclude={participant:true,event:{include:{staff:{select:{userId:true}}}},checkin:{include:{operator:true}}} as const;
export type LoadedTicket=Prisma.TicketGetPayload<{include:typeof ticketInclude}>;
export const loadTicketForCheckin=(where:Prisma.TicketWhereUniqueInput)=>db.ticket.findUnique({where,include:ticketInclude});

type Context={operator:Operator;method:CheckinMethod;eventId?:string;resolution?:UnpaidResolution;verification?:Verification;phoneLast4?:string;qrToken?:string};
const describe=(t:LoadedTicket)=>({participantName:t.participant.name,eventName:t.event.name,ticketNumber:t.ticketNumber,ticketId:t.id});
const ACTION:Record<CheckinMethod,string>={QR:"QR_CHECKIN",RECEPTION_CODE:"RECEPTION_CODE_CHECKIN",NAME_SEARCH:"NAME_SEARCH_CHECKIN"};
const TYPE:Record<CheckinMethod,"QR"|"RECEPTION_CODE"|"NAME_SEARCH">={QR:"QR",RECEPTION_CODE:"RECEPTION_CODE",NAME_SEARCH:"NAME_SEARCH"};

/** 3方式(QR/受付コード/参加者検索)共通の受付確定処理。権限・状態・支払・二重受付をここで一括判定する。 */
export async function finalizeCheckin(ticket:LoadedTicket,ctx:Context):Promise<CheckinResult>{
  const {operator,method}=ctx;
  if(!canAccessEvent({role:operator.role,userId:operator.id,managerId:ticket.event.managerId,assignedUserIds:ticket.event.staff.map(s=>s.userId)}))return {kind:"FORBIDDEN",message:"このイベントを受付する権限がありません"};
  const paid=ticket.paymentStatus==="PAID";
  const gate=decideCheckinGate({valid:ticket.status!=="CANCELLED",sameEvent:!ctx.eventId||ticket.eventId===ctx.eventId,alreadyCheckedIn:Boolean(ticket.checkin),paid,resolution:ctx.resolution});
  if(gate==="INVALID")return {kind:"INVALID",message:"チケットが無効です"};
  if(gate==="WRONG_EVENT")return {kind:"WRONG_EVENT",...describe(ticket),message:"別イベントのチケットです"};
  if(gate==="ALREADY_CHECKED_IN"){const c=ticket.checkin!;return {kind:"ALREADY_CHECKED_IN",...describe(ticket),checkedInAt:c.checkedInAt.toISOString(),checkedInBy:c.operator.name,message:"受付済みです"}}
  if(gate==="UNPAID")return {kind:"UNPAID",...describe(ticket),message:"未入金です"};
  if(gate==="REJECTED")return {kind:"REJECTED",...describe(ticket),message:"受付を拒否しました"};
  if(gate==="NEEDS_ADMIN")return {kind:"NEEDS_ADMIN",...describe(ticket),message:"管理者確認待ちです"};
  const onsite=!paid&&ctx.resolution==="ONSITE_PAYMENT";
  const checkinId=randomUUID();
  const audit=(extra?:Record<string,unknown>)=>({actorId:operator.id,action:onsite?"ONSITE_PAYMENT_AND_CHECKIN":ACTION[method],entityType:"Checkin",entityId:checkinId,after:{ticketId:ticket.id,eventId:ticket.eventId,method,verification:ctx.verification??null,...extra}});
  const done=(at:Date):CheckinResult=>({kind:"OK",...describe(ticket),checkedInAt:at.toISOString(),checkedInBy:operator.name,message:"受付OK"});
  try{
    // 二重受付は Checkin.ticketId の一意制約で保証する。入金が絡む場合のみ Serializable にする。
    return await db.$transaction(async tx=>{
      if(onsite){
        await tx.payment.create({data:{ticketId:ticket.id,amount:ticket.event.price,paymentMethod:"ONSITE",status:"PAID",payerName:ticket.participant.name,paidAt:new Date(),confirmedBy:operator.id,confirmedAt:new Date()}});
        await tx.ticket.update({where:{id:ticket.id},data:{paymentStatus:"PAID",status:"ACTIVE"}});
      }
      const checkin=await tx.checkin.create({data:{id:checkinId,eventId:ticket.eventId,ticketId:ticket.id,participantId:ticket.participantId,checkedInBy:operator.id,checkinType:TYPE[method],verification:ctx.verification??null}});
      // 取消・譲渡(QR再発行)と競合した場合は、受付を確定させずにロールバックする
      const guarded=await tx.ticket.updateMany({where:{id:ticket.id,qrTokenVersion:ticket.qrTokenVersion,status:{not:"CANCELLED"}},data:{status:"USED"}});
      if(guarded.count!==1)throw new Error("TICKET_CHANGED");
      await tx.eventRegistration.updateMany({where:{ticketId:ticket.id},data:{attendanceStatus:"CHECKED_IN"}});
      await tx.auditLog.create({data:audit()});
      return done(checkin.checkedInAt);
    },onsite?{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}:undefined);
  }catch(error){
    if(error instanceof Error&&error.message==="TICKET_CHANGED")return {kind:"INVALID",message:"チケットが変更されました。最新のQR・受付コードで再度お試しください"};
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002"){
      const existing=await db.checkin.findUnique({where:{ticketId:ticket.id},include:{operator:true}});
      if(existing)return {kind:"ALREADY_CHECKED_IN",...describe(ticket),checkedInAt:existing.checkedInAt.toISOString(),checkedInBy:existing.operator.name,message:"受付済みです"};
    }
    throw error;
  }
}

/** ① QR受付 */
export async function processCheckin(input:{token:string;eventId?:string;operatorId:string;operatorName:string;operatorRole?:UserRole;resolution?:UnpaidResolution}):Promise<CheckinResult>{
  const secret=process.env.QR_TOKEN_SECRET??"";
  const verified=verifyTicketToken(input.token,secret);
  if(!verified)return {kind:"INVALID",message:"QRコードが無効です"};
  if(isLocalDemo())return processDemo({...input,ticketId:verified.ticketId});
  const ticket=await loadTicketForCheckin({id:verified.ticketId});
  if(!ticket||ticket.qrTokenVersion!==verified.version||ticket.qrTokenHash!==hashTicketToken(input.token))return {kind:"INVALID",message:"チケットが無効です"};
  return finalizeCheckin(ticket,{operator:{id:input.operatorId,name:input.operatorName,role:input.operatorRole??"SUPER_ADMIN"},method:"QR",eventId:input.eventId,resolution:input.resolution});
}

/** ② 受付コード受付(イベント単位で照合。総当たり対策として失敗回数を制限) */
export async function processCheckinByCode(input:{eventId:string;code:string;operator:Operator;resolution?:UnpaidResolution}):Promise<CheckinResult>{
  const code=normalizeReceptionCode(input.code);
  if(!code)return {kind:"INVALID",message:"受付コードは6桁の数字です"};
  if(await recentCodeFailures(input.operator.id)>=CODE_FAILURE_LIMIT)return {kind:"LOCKED",message:"受付コードの入力ミスが続いたため、しばらく待ってから再試行してください"};
  const ticket=await loadTicketForCheckin({eventId_receptionCode:{eventId:input.eventId,receptionCode:code}});
  if(!ticket||ticket.status==="CANCELLED"){await recordCodeFailure(input.operator.id,input.eventId);return {kind:"INVALID",message:"受付コードが見つかりません"}}
  return finalizeCheckin(ticket,{operator:input.operator,method:"RECEPTION_CODE",eventId:input.eventId,resolution:input.resolution});
}

export function maskEmail(email:string){const [local,domain]=email.split("@");return domain?`${local.slice(0,2)}***@${domain}`:"***"}
export type Candidate={ticketId:string;ticketNumber:string;name:string;nameKana:string;emailMasked:string;purchaser:string|null;paymentStatus:string;checkedInAt:string|null;sameNameCount:number};
/** ③ 参加者検索: 氏名・かな・チケット番号で候補を返す。同姓同名は sameNameCount>1 で区別できるようにする。 */
export async function searchCheckinCandidates(input:{eventId:string;query:string;operator:Operator;limit?:number}):Promise<Candidate[]|"FORBIDDEN">{
  const q=input.query.trim().normalize("NFKC");
  if(q.length<1)return [];
  const event=await db.event.findUnique({where:{id:input.eventId},select:{managerId:true,staff:{select:{userId:true}}}});
  if(!event||!canAccessEvent({role:input.operator.role,userId:input.operator.id,managerId:event.managerId,assignedUserIds:event.staff.map(s=>s.userId)}))return "FORBIDDEN";
  const rows=await db.ticket.findMany({where:{eventId:input.eventId,status:{not:"CANCELLED"},OR:[{ticketNumber:{contains:q,mode:"insensitive"}},{participant:{name:{contains:q,mode:"insensitive"}}},{participant:{nameKana:{contains:q,mode:"insensitive"}}}]},include:{participant:true,checkin:true,order:{include:{buyer:true}}},orderBy:[{participant:{nameKana:"asc"}},{ticketNumber:"asc"}],take:input.limit??20});
  const sameNamed=await db.participant.findMany({where:{name:{in:[...new Set(rows.map(r=>r.participant.name))]},tickets:{some:{eventId:input.eventId,status:{not:"CANCELLED"}}}},select:{id:true,name:true}});
  const sameName=new Map<string,number>();
  for(const p of sameNamed)sameName.set(p.name,(sameName.get(p.name)??0)+1);
  return rows.map(r=>({ticketId:r.id,ticketNumber:r.ticketNumber,name:r.participant.name,nameKana:r.participant.nameKana,emailMasked:maskEmail(r.participant.email),purchaser:r.order?.buyer?.name??null,paymentStatus:r.paymentStatus,checkedInAt:r.checkin?.checkedInAt.toISOString()??null,sameNameCount:sameName.get(r.participant.name)??1}));
}

/** ③ 参加者検索での受付確定。同姓同名の候補が複数いる場合は「申告のみ」を認めず、電話番号下4桁か身分証での確認を必須にする。 */
export async function processCheckinBySearch(input:{eventId:string;ticketId:string;verification:Verification;phoneLast4?:string;operator:Operator;resolution?:UnpaidResolution}):Promise<CheckinResult>{
  const ticket=await loadTicketForCheckin({id:input.ticketId});
  if(!ticket||ticket.eventId!==input.eventId||ticket.status==="CANCELLED")return {kind:"INVALID",message:"対象の参加者が見つかりません"};
  const homonyms=await db.ticket.count({where:{eventId:input.eventId,status:{not:"CANCELLED"},participant:{name:ticket.participant.name},participantId:{not:ticket.participantId}}});
  if(input.verification==="PHONE_LAST4"){
    const last4=ticket.participant.phone.replace(/\D/g,"").slice(-4);
    if(!input.phoneLast4||input.phoneLast4.normalize("NFKC")!==last4)return {kind:"VERIFY_REQUIRED",...describe(ticket),message:"電話番号の下4桁が一致しません"};
  }else if(homonyms>0&&input.verification==="SELF_DECLARED"){
    return {kind:"VERIFY_REQUIRED",...describe(ticket),message:"同姓同名の参加者がいます。電話番号の下4桁または身分証で確認してください"};
  }
  return finalizeCheckin(ticket,{operator:input.operator,method:"NAME_SEARCH",eventId:input.eventId,resolution:input.resolution,verification:input.verification});
}

function processDemo(input:{ticketId:string;operatorName:string;resolution?:UnpaidResolution}):CheckinResult{const paid=input.ticketId==="demo-ticket-a001";const unpaid=input.ticketId==="demo-ticket-unpaid";if(!paid&&!unpaid)return {kind:"INVALID",message:"チケットが無効です"};const name=paid?"山田 太郎":"佐藤 花子";const existing=demoState.demoCheckins?.get(input.ticketId);if(existing)return {kind:"ALREADY_CHECKED_IN",participantName:name,eventName:"秋のビジネス交流会 2026",ticketNumber:paid?"EV-A001":"EV-A002",checkedInAt:existing.at,checkedInBy:existing.by,message:"受付済みです"};if(unpaid&&!input.resolution)return {kind:"UNPAID",participantName:name,eventName:"秋のビジネス交流会 2026",ticketNumber:"EV-A002",message:"未入金です"};if(input.resolution==="REJECT")return {kind:"REJECTED",participantName:name,ticketNumber:"EV-A002",message:"受付を拒否しました"};if(input.resolution==="ADMIN_CONFIRMATION")return {kind:"NEEDS_ADMIN",participantName:name,ticketNumber:"EV-A002",message:"管理者確認待ちです"};const at=new Date().toISOString();demoState.demoCheckins?.set(input.ticketId,{at,by:input.operatorName});return {kind:"OK",participantName:name,eventName:"秋のビジネス交流会 2026",ticketNumber:paid?"EV-A001":"EV-A002",checkedInAt:at,checkedInBy:input.operatorName,message:"受付OK"}}
