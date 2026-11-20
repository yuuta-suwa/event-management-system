import {randomBytes} from "node:crypto";
import type {Prisma} from "@prisma/client";
import {db} from "@/server/db";
import {retryTransient} from "@/server/transient";
import {hashTicketToken,issueTicketToken,qrTokenSecret} from "@/features/tickets/token";
import {generateLineLinkCode} from "@/features/participants/line-link-code";
import {phoneDigits} from "@/features/transfers/holder";
import {parseJstDateTime,formatJstDate} from "@/lib/jst";
import {personKey,type ParsedRow,type RosterRow} from "./backfill-domain";
type Client=Prisma.TransactionClient|typeof db;
class AlreadyRegistered extends Error{}

export type Actor={id:string;role?:string};
export type EventForRoster={id:string;name:string;price:number;eventDate:Date;startTime:Date;managerId:string};
/** 過去の記録を入力できる人: システム管理者、またはそのイベントの管理者。 */
export function canManageRoster(user:{id:string;role?:string},event:{managerId:string}){
  return user.role==="SUPER_ADMIN"||(user.role==="EVENT_MANAGER"&&event.managerId===user.id);
}
export async function loadRosterEvent(client:Client,eventId:string):Promise<EventForRoster|null>{
  return client.event.findUnique({where:{id:eventId},select:{id:true,name:true,price:true,eventDate:true,startTime:true,managerId:true}});
}
export async function resolveRosterActor(client:Client,user:Actor){
  if(user.role)return {id:user.id,role:user.role};
  const row=await client.user.findUnique({where:{id:user.id},select:{role:true}});
  return {id:user.id,role:row?.role??"PARTICIPANT"};
}

export type RowStatus="NEW"|"EXISTING_PERSON"|"ALREADY_REGISTERED"|"DUPLICATE_IN_PASTE"|"ERROR";
export type RowOutcome={line:number;name:string;status:RowStatus;message?:string;payment?:string;attendance?:string;saved?:boolean};
export type ImportResult={ok:true;results:RowOutcome[];counts:{total:number;created:number;newPeople:number;existingPeople:number;skipped:number;errors:number};committed:boolean}|{ok:false;error:string};

type Located={participantId:string|null;duplicate:boolean;reason?:string};
/** この行が、すでに名簿にいる人か・同じイベントに登録済みかを調べる。
 *  照合: メール(あれば) → 電話+同じ名前 → (連絡先なしの行は)同じイベントの同名の登録。電話だけ同じ別人(家族)を同一人物にしない。 */
async function locate(client:Client,eventId:string,r:RosterRow):Promise<Located>{
  let participant:{id:string}|null=null;
  if(r.email)participant=await client.participant.findFirst({where:{email:{equals:r.email,mode:"insensitive"}},select:{id:true},orderBy:{createdAt:"asc"}});
  if(!participant&&r.phone){
    const digits=phoneDigits(r.phone);
    const candidates=await client.participant.findMany({where:{phone:{not:""},name:r.name},select:{id:true,phone:true},take:20});
    participant=candidates.find(c=>phoneDigits(c.phone)===digits)??null;
  }
  if(participant){
    const reg=await client.eventRegistration.findUnique({where:{eventId_participantId:{eventId,participantId:participant.id}},select:{id:true}});
    return reg?{participantId:participant.id,duplicate:true,reason:"このイベントにはすでに登録されています"}:{participantId:participant.id,duplicate:false};
  }
  if(!r.email&&!r.phone){
    const same=await client.eventRegistration.findFirst({where:{eventId,participant:{name:r.name}},select:{id:true}});
    if(same)return {participantId:null,duplicate:true,reason:"同じ名前の方がすでにこのイベントに登録されています（別の方の場合は、電話かメールを入れてください）"};
  }
  return {participantId:null,duplicate:false};
}

const dayStart=(day:string)=>parseJstDateTime(day);
/** 受付日時: 時刻まであればそのとおり。日付だけなら、その日のイベント開始時刻。空ならイベントの開始時刻。 */
export function resolveCheckinAt(value:string|null,event:Pick<EventForRoster,"startTime">){
  if(!value)return event.startTime;
  if(value.length>10)return parseJstDateTime(value);
  const time=event.startTime.toLocaleTimeString("en-GB",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit"});
  return parseJstDateTime(`${value}T${time}`);
}
export function resolvePaidAt(value:string|null,event:Pick<EventForRoster,"eventDate">){return value?dayStart(value):dayStart(formatJstDate(event.eventDate))}

async function createRecord(tx:Prisma.TransactionClient,event:EventForRoster,actor:{id:string},r:RosterRow,located:Located){
  const paid=r.payment==="PAID",attended=r.attendance==="ATTENDED";
  const paidAt=resolvePaidAt(r.paidAt,event);
  const checkedInAt=resolveCheckinAt(r.checkedInAt,event);
  let introducerStaffId:string|null=null,referrerName:string|null=null;
  if(r.introducer){
    const staff=await tx.staffProfile.findFirst({where:{displayName:{equals:r.introducer,mode:"insensitive"}},select:{id:true}});
    if(staff)introducerStaffId=staff.id;else referrerName=r.introducer;
  }
  const participantId=located.participantId??(await tx.participant.create({data:{name:r.name,nameKana:r.nameKana,phone:r.phone,email:r.email,referrerName,notes:r.notes||null,lineLinkCode:generateLineLinkCode()}})).id;
  const appliedAt=paid?paidAt:event.eventDate;
  const ticket=await tx.ticket.create({data:{eventId:event.id,participantId,introducerStaffId,ticketNumber:`EV-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`,qrTokenHash:hashTicketToken(randomBytes(32).toString("base64url")),status:attended?"USED":paid?"ACTIVE":"PROVISIONAL",paymentStatus:paid?"PAID":"UNPAID",issuedAt:paid?paidAt:null,createdAt:appliedAt}});
  if(paid){
    await tx.ticket.update({where:{id:ticket.id},data:{qrTokenHash:hashTicketToken(issueTicketToken(ticket.id,ticket.qrTokenVersion,qrTokenSecret()))}});
    await tx.payment.create({data:{ticketId:ticket.id,amount:r.amount??event.price,paymentMethod:r.method,status:"PAID",payerName:r.name,paidAt,confirmedBy:actor.id,confirmedAt:new Date(),createdAt:paidAt}});
  }
  if(attended)await tx.checkin.create({data:{eventId:event.id,ticketId:ticket.id,participantId,checkedInAt,checkedInBy:actor.id,checkinType:"MANUAL",verification:"BACKFILL"}});
  const registration=await tx.eventRegistration.create({data:{eventId:event.id,participantId,ticketId:ticket.id,attendanceStatus:attended?"CHECKED_IN":r.attendance==="ABSENT"?"ABSENT":paid?"PAID":"APPLIED",applicationSource:"BACKFILL",appliedAt}});
  await tx.auditLog.create({data:{actorId:actor.id,action:"ROSTER_BACKFILL_CREATED",entityType:"EventRegistration",entityId:registration.id,after:{eventId:event.id,participantId,newParticipant:!located.participantId,ticketNumber:ticket.ticketNumber,payment:r.payment,amount:paid?r.amount??event.price:null,attendance:r.attendance}}});
}

/** 過去の記録を名簿に入力する(メール・LINEなどの通知は一切送らない)。commit=false なら何も保存せず、結果の見込みだけ返す(確認用)。
 *  1人ずつ保存するので、途中で止まっても保存済みの人は残り、同じ内容でもう一度実行すれば残りだけ入る(登録済みはスキップ)。 */
export async function importRoster(user:Actor,input:{eventId:string;rows:ParsedRow[];commit:boolean}):Promise<ImportResult>{
  const who=await resolveRosterActor(db,user);
  const event=await loadRosterEvent(db,input.eventId);
  if(!event)return {ok:false,error:"イベントが見つかりません"};
  if(!canManageRoster(who,event))return {ok:false,error:"このイベントの名簿を入力する権限がありません"};
  const results:RowOutcome[]=[];const seen=new Map<string,number>();
  for(const p of input.rows){
    const name=p.row?.name||p.name||"（名前なし）";
    if(!p.row){results.push({line:p.line,name,status:"ERROR",message:p.errors.join(" / ")});continue}
    const r=p.row,key=personKey(r);
    if(seen.has(key)){results.push({line:p.line,name,status:"DUPLICATE_IN_PASTE",message:`${seen.get(key)}行目と同じ人のため、この行は入力しません`});continue}
    seen.set(key,p.line);
    try{
      const located=await retryTransient(()=>locate(db,event.id,r));
      if(located.duplicate){results.push({line:p.line,name,status:"ALREADY_REGISTERED",message:located.reason});continue}
      if(input.commit){
        await retryTransient(()=>db.$transaction(async tx=>{
          // 同時に同じ行が入らないよう、保存の直前に確認し直す
          const again=await locate(tx,event.id,r);
          if(again.duplicate)throw new AlreadyRegistered(again.reason);
          await createRecord(tx,event,who,r,again);
        }));
      }
      results.push({line:p.line,name,status:located.participantId?"EXISTING_PERSON":"NEW",payment:r.payment,attendance:r.attendance,saved:input.commit,message:located.participantId?"名簿にいる方です（既存の情報は変更せず、このイベントの記録だけ追加します）":undefined});
    }catch(e){
      if(e instanceof AlreadyRegistered){results.push({line:p.line,name,status:"ALREADY_REGISTERED",message:e.message});continue}
      console.error("importRoster row failed",p.line,e);
      results.push({line:p.line,name,status:"ERROR",message:"保存できませんでした。もう一度お試しください"});
    }
  }
  const count=(s:RowStatus)=>results.filter(r=>r.status===s).length;
  const created=count("NEW")+count("EXISTING_PERSON");
  return {ok:true,committed:input.commit,results,counts:{total:results.length,created,newPeople:count("NEW"),existingPeople:count("EXISTING_PERSON"),skipped:count("ALREADY_REGISTERED")+count("DUPLICATE_IN_PASTE"),errors:count("ERROR")}};
}
