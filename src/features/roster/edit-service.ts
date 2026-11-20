import type {Prisma} from "@prisma/client";
import {Prisma as P} from "@prisma/client";
import {db} from "@/server/db";
import {retryTransient} from "@/server/transient";
import {hashTicketToken,issueTicketToken,qrTokenSecret} from "@/features/tickets/token";
import {formatJstDate,formatJstDateTimeLocal,parseJstDateTime} from "@/lib/jst";
import {canManageRoster,resolveRosterActor,type Actor} from "./backfill-service";
import {diffRoster,normalizeReason,parseRosterEdit,PARTICIPANT_FIELDS,RECORD_FIELDS,snapshotOf,tidyValues,withDefaults,type Change,type Values} from "./edit-domain";
type Client=Prisma.TransactionClient|typeof db;
class EditFailure extends Error{constructor(readonly code:string,readonly fieldErrors?:Record<string,string>){super(code)}}

export type RosterTarget={
  registrationId:string;eventId:string;eventName:string;managerId:string;eventPrice:number;eventDay:string;eventStart:string;
  participantId:string;values:Values;
  ticket:{id:string;status:string;paymentStatus:string;qrTokenVersion:number}|null;
  paymentId:string|null;exitRecords:boolean;
  /** 入金・出欠を直せない理由(取消済みのチケットなど)。名前・連絡先は常に直せる。 */
  recordLockedReason:string|null;
  /** 入金済みから未入金に戻す操作はここではできない(返金・取消は入金の画面から) */
  canUnpay:false;
};
/** 名簿の1行(イベントへの申込)を、編集用に読み込む。 */
export async function loadRosterTarget(client:Client,registrationId:string):Promise<RosterTarget|null>{
  const r=await client.eventRegistration.findUnique({where:{id:registrationId},include:{event:{select:{id:true,name:true,managerId:true,price:true,eventDate:true,startTime:true}},participant:true,ticket:{include:{checkin:true,checkouts:{select:{id:true},take:1},payments:{where:{status:"PAID"},orderBy:{createdAt:"desc"},take:1}}}}});
  if(!r)return null;
  const p=r.participant,t=r.ticket,pay=t?.payments[0]??null;
  const attended=Boolean(t?.checkin);
  const values:Values={
    name:p.name,nameKana:p.nameKana,phone:p.phone||null,email:p.email||null,gender:p.gender,age:p.age,occupation:p.occupation,referrerName:p.referrerName,snsContact:p.snsContact,notes:p.notes,
    attendance:attended?"ATTENDED":r.attendanceStatus==="ABSENT"?"ABSENT":"NONE",
    checkedInAt:t?.checkin?formatJstDateTimeLocal(t.checkin.checkedInAt):null,
    payment:t?.paymentStatus==="PAID"?"PAID":"UNPAID",
    amount:pay?.amount??null,method:pay?.paymentMethod??null,paidAt:pay?.paidAt?formatJstDate(pay.paidAt):null,
  };
  const locked=!t?"チケットがない申込のため、入金・出欠は直せません":["CANCELLED","EXPIRED","TRANSFERRED"].includes(t.status)?"取消・期限切れ・譲渡済みのチケットのため、入金・出欠は直せません":["CANCELLED","REFUNDED"].includes(t.paymentStatus)?"キャンセル・返金済みの入金のため、入金・出欠は直せません":null;
  return {registrationId:r.id,eventId:r.event.id,eventName:r.event.name,managerId:r.event.managerId,eventPrice:r.event.price,eventDay:formatJstDate(r.event.eventDate),eventStart:formatJstDateTimeLocal(r.event.startTime),participantId:p.id,values:tidyValues(values),ticket:t?{id:t.id,status:t.status,paymentStatus:t.paymentStatus,qrTokenVersion:t.qrTokenVersion}:null,paymentId:pay?.id??null,exitRecords:(t?.checkouts.length??0)>0,recordLockedReason:locked,canUnpay:false};
}

export type EditInput={registrationId:string;reason:unknown;fields:Record<string,unknown>;snapshot?:string};
export type EditResult={ok:true;eventId:string;changes:Change[]}|{ok:false;error:string;eventId?:string;fieldErrors?:Record<string,string>};

/** 参加者名簿の1行を直す。理由は必須。変更前後・理由・直した人は監査ログ(ROSTER_ENTRY_EDITED)に残る。
 *  参加者の情報(名前・連絡先など。同じ人の他のイベントにも反映)と、このイベントでの入金・出欠を直せる。メール・LINEなどの通知は送らない。 */
export async function applyRosterEdit(user:Actor,input:EditInput):Promise<EditResult>{
  const reason=normalizeReason(input.reason);
  if(!reason.ok)return {ok:false,error:reason.error};
  const who=await resolveRosterActor(db,user);
  const pre=await loadRosterTarget(db,input.registrationId);
  if(!pre)return {ok:false,error:"not_found"};
  if(!canManageRoster(who,{managerId:pre.managerId}))return {ok:false,error:"forbidden"};
  try{
    const changes=await retryTransient(()=>db.$transaction(async tx=>{
      const t=await loadRosterTarget(tx,input.registrationId);
      if(!t)throw new EditFailure("not_found");
      if(input.snapshot!==undefined&&input.snapshot!==snapshotOf(t.values))throw new EditFailure("stale");
      const parsed=parseRosterEdit(input.fields);
      if(!parsed.ok)throw new EditFailure("invalid",parsed.errors);
      const dflt={price:t.eventPrice,eventDate:t.eventDay,startTime:t.eventStart};
      // 入金・出欠を直せない記録(取消済みなど)は、画面で入力欄が無効になり送られてこない。もし変更が送られてきたら拒否する。
      if(t.recordLockedReason&&RECORD_FIELDS.some(f=>input.fields[f]!==undefined)){
        const attempted=diffRoster(t.values,tidyValues(withDefaults(tidyValues(parsed.values),dflt))).filter(c=>(RECORD_FIELDS as readonly string[]).includes(c.field));
        if(attempted.length>0)throw new EditFailure("record_locked");
      }
      // 送られてこなかった入金・出欠は、現在の値のまま変えない。
      const submitted:Values=t.recordLockedReason?{...parsed.values,...Object.fromEntries(RECORD_FIELDS.map(f=>[f,t.values[f]]))}:parsed.values;
      const next=tidyValues(withDefaults(tidyValues(submitted),dflt));
      const diff=diffRoster(t.values,next);
      if(diff.length===0)throw new EditFailure("no_change");
      const changed=new Set(diff.map(c=>c.field));
      const recordChanged=RECORD_FIELDS.some(f=>changed.has(f));
      if(recordChanged){
        if(t.recordLockedReason||!t.ticket)throw new EditFailure("record_locked");
        if(t.values.payment==="PAID"&&next.payment==="UNPAID")throw new EditFailure("unpay_not_supported");
        if(t.values.attendance==="ATTENDED"&&next.attendance!=="ATTENDED"&&t.exitRecords)throw new EditFailure("exit_records");
      }
      // 参加者の情報
      const pdata:Record<string,unknown>={};
      for(const f of PARTICIPANT_FIELDS)if(changed.has(f)){
        const val=next[f];
        pdata[f]=f==="phone"||f==="email"?(val??""):val;
      }
      if(Object.keys(pdata).length>0)await tx.participant.update({where:{id:t.participantId},data:pdata});
      // このイベントでの入金・出欠
      if(recordChanged&&t.ticket){
        const ticket=t.ticket;
        const paid=next.payment==="PAID",attended=next.attendance==="ATTENDED";
        if(paid&&t.values.payment!=="PAID"){
          const paidAt=parseJstDateTime(next.paidAt as string);
          await tx.payment.create({data:{ticketId:ticket.id,amount:next.amount as number,paymentMethod:next.method as string,status:"PAID",payerName:next.name as string,paidAt,confirmedBy:who.id,confirmedAt:new Date(),createdAt:paidAt}});
          await tx.ticket.update({where:{id:ticket.id},data:{paymentStatus:"PAID",issuedAt:paidAt,qrTokenHash:hashTicketToken(issueTicketToken(ticket.id,ticket.qrTokenVersion,qrTokenSecret()))}});
        }else if(paid&&t.paymentId&&(changed.has("amount")||changed.has("method")||changed.has("paidAt"))){
          await tx.payment.update({where:{id:t.paymentId},data:{amount:next.amount as number,paymentMethod:next.method as string,paidAt:parseJstDateTime(next.paidAt as string)}});
        }
        if(attended&&t.values.attendance!=="ATTENDED"){
          await tx.checkin.create({data:{eventId:t.eventId,ticketId:ticket.id,participantId:t.participantId,checkedInAt:parseJstDateTime(next.checkedInAt as string),checkedInBy:who.id,checkinType:"MANUAL",verification:"ROSTER_EDIT"}});
        }else if(attended&&changed.has("checkedInAt")){
          await tx.checkin.update({where:{ticketId:ticket.id},data:{checkedInAt:parseJstDateTime(next.checkedInAt as string)}});
        }else if(!attended&&t.values.attendance==="ATTENDED"){
          await tx.checkin.delete({where:{ticketId:ticket.id}});
        }
        if(changed.has("attendance")||changed.has("payment")){
          await tx.ticket.update({where:{id:ticket.id},data:{status:attended?"USED":paid?"ACTIVE":"PROVISIONAL"}});
          await tx.eventRegistration.update({where:{id:t.registrationId},data:{attendanceStatus:attended?"CHECKED_IN":next.attendance==="ABSENT"?"ABSENT":paid?"PAID":"APPLIED"}});
        }
      }
      await tx.auditLog.create({data:{actorId:who.id,action:"ROSTER_ENTRY_EDITED",entityType:"EventRegistration",entityId:t.registrationId,before:Object.fromEntries(diff.map(c=>[c.field,c.before])) as Prisma.InputJsonValue,after:{changes:diff,reason:reason.reason,participantId:t.participantId,eventId:t.eventId,name:t.values.name} as unknown as Prisma.InputJsonValue}});
      return diff;
    },{isolationLevel:P.TransactionIsolationLevel.Serializable}));
    return {ok:true,eventId:pre.eventId,changes};
  }catch(error){
    if(error instanceof EditFailure)return {ok:false,error:error.code,eventId:pre.eventId,fieldErrors:error.fieldErrors};
    if(error instanceof P.PrismaClientKnownRequestError&&error.code==="P2034")return {ok:false,error:"conflict",eventId:pre.eventId};
    throw error;
  }
}

export type HistoryRow={id:string;at:Date;editor:string|null;kind:"EDIT"|"BACKFILL";eventId:string|null;reason:string;changes:Change[]};
/** この名簿の行(と同じ人)の編集履歴。新しい順。過去の記録として入力された記録も「入力」として出る。 */
export async function listRosterHistory(client:Client,t:{registrationId:string;participantId:string},take=50):Promise<HistoryRow[]>{
  const rows=await client.auditLog.findMany({where:{OR:[{action:{in:["ROSTER_ENTRY_EDITED","ROSTER_BACKFILL_CREATED"]},entityId:t.registrationId},{action:"ROSTER_ENTRY_EDITED",after:{path:["participantId"],equals:t.participantId}}]},orderBy:{createdAt:"desc"},take,include:{actor:{select:{name:true}}}});
  return rows.map(r=>{
    const after=(r.after??{}) as {changes?:Change[];reason?:string;eventId?:string};
    return {id:r.id,at:r.createdAt,editor:r.actor?.name??null,kind:r.action==="ROSTER_BACKFILL_CREATED"?"BACKFILL":"EDIT",eventId:after.eventId??null,reason:after.reason??"",changes:Array.isArray(after.changes)?after.changes:[]};
  });
}
