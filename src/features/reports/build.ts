import {db} from "@/server/db";
import {decideAccess} from "@/features/collection/domain";
import {canViewLedger} from "@/features/ledger/access";
import {buildLedger} from "@/features/ledger/data";
import {attendanceStats,ticketStats,type ReportKind,type ReportRights,type Snapshot} from "./domain";

export async function loadReportRights(user:{id:string;role:string},eventId:string):Promise<{rights:ReportRights;event:{id:string;name:string;managerId:string}}|null>{
  const event=await db.event.findUnique({where:{id:eventId},select:{id:true,name:true,managerId:true}});
  if(!event)return null;
  const assignments=await db.eventRoleAssignment.findMany({where:{eventId},select:{userId:true,role:true,active:true}});
  const access=decideAccess({role:user.role,userId:user.id,managerId:event.managerId,assignments});
  const reporter=assignments.some(a=>a.active&&a.role==="REPORTER"&&a.userId===user.id);
  return {event,rights:{manager:access.manager,collector:access.collector,approver:access.approver,reporter,ledger:canViewLedger(user.id,assignments)}};
}

const jst=(d:Date)=>d.toISOString();
/** 提出時点の集計結果。権限に応じて含める範囲を決める(集金担当者は自身の担当範囲のみ、非公開帳簿は決裁権者本人のみ)。 */
export async function buildSnapshot(eventId:string,kind:ReportKind,ctx:{reporterId:string;reporterName:string;rights:ReportRights;scope:"ALL"|"OWN"},now=new Date()):Promise<Snapshot|null>{
  const event=await db.event.findUnique({where:{id:eventId},select:{id:true,name:true,eventDate:true,venueName:true,startTime:true,endTime:true,price:true}});
  if(!event)return null;
  const snap:Snapshot={meta:{eventId:event.id,eventName:event.name,eventDate:jst(event.eventDate),venueName:event.venueName,startTime:jst(event.startTime),endTime:jst(event.endTime),generatedAt:jst(now),reporterName:ctx.reporterName,scope:ctx.scope}};
  if(kind==="COLLECTION"||kind==="INTEGRATED"){
    const own=ctx.scope==="OWN";
    const tickets=await db.ticket.findMany({where:{eventId,...(own?{collectorId:ctx.reporterId}:{})},include:{order:{select:{buyerParticipantId:true}},payments:{orderBy:{createdAt:"desc"},take:1,select:{amount:true}}}});
    const refunds=await db.payment.aggregate({where:{ticket:{eventId,...(own?{collectorId:ctx.reporterId}:{})},status:"REFUNDED"},_sum:{amount:true}});
    snap.tickets=ticketStats(event.price,tickets.map(t=>({status:t.status,paymentStatus:t.paymentStatus,amount:t.payments[0]?.amount??event.price,buyerKey:t.order?.buyerParticipantId??t.participantId})),refunds._sum.amount??0);
    const fee=await db.feeAdvance.findMany({where:{eventId,status:{not:"CANCELLED"},...(own?{createdBy:ctx.reporterId}:{})},include:{recoveries:true},orderBy:{advancedAt:"asc"}});
    const ticketNos=new Map<string,string>();const orderNos=new Map<string,string[]>();
    const ids=fee.flatMap(f=>f.ticketId?[f.ticketId]:[]),orderIds=fee.flatMap(f=>f.orderId?[f.orderId]:[]);
    if(ids.length||orderIds.length)for(const t of await db.ticket.findMany({where:{OR:[{id:{in:ids}},{orderId:{in:orderIds}}]},select:{id:true,orderId:true,ticketNumber:true}})){ticketNos.set(t.id,t.ticketNumber);if(t.orderId)orderNos.set(t.orderId,[...(orderNos.get(t.orderId)??[]),t.ticketNumber])}
    snap.feeAdvances=fee.map(f=>{const recovered=f.recoveries.reduce((n,r)=>n+r.amount,0);return {obligor:f.obligorName,advancer:f.advancerName,amount:f.amount,tickets:(f.ticketId?[ticketNos.get(f.ticketId)??""]:orderNos.get(f.orderId??"")??[]).join("、"),advancedAt:jst(f.advancedAt),recovered,outstanding:f.amount-recovered,status:f.status}});
    const exp=await db.expenseAdvance.findMany({where:{eventId,status:{in:["APPROVED","PARTIALLY_SETTLED","SETTLED"]},...(own?{requestedBy:ctx.reporterId}:{})},include:{settlements:true},orderBy:{paidAt:"asc"}});
    snap.expenseAdvances=exp.map(e=>{const settled=e.settlements.reduce((n,s)=>n+s.amount,0);return {advancer:e.advancerName,category:e.category,payee:e.payee,amount:e.amount,paidAt:jst(e.paidAt),settled,unsettled:e.amount-settled,status:e.status}});
  }
  if(kind==="PARTICIPANT"||kind==="INTEGRATED"){
    const regs=await db.eventRegistration.findMany({where:{eventId,attendanceStatus:{not:"CANCELLED"},ticketId:{not:null}},include:{participant:{select:{name:true}},ticket:{include:{checkin:{include:{operator:{select:{name:true}}}}}}},orderBy:{participant:{nameKana:"asc"}}});
    const live=regs.filter(r=>r.ticket&&r.ticket.status!=="CANCELLED"&&r.ticket.status!=="EXPIRED");
    const rows=live.map(r=>{const c=r.ticket!.checkin;return {checkedIn:Boolean(c),walkIn:r.attendanceStatus==="WALK_IN"||c?.checkinType==="WALK_IN"}});
    snap.participants={...attendanceStats(rows,event.endTime<=now),roster:live.map(r=>{const c=r.ticket!.checkin;return {name:r.participant.name,ticketNumber:r.ticket!.ticketNumber,checkedInAt:c?jst(c.checkedInAt):null,method:c?.checkinType??null,operator:c?.operator.name??null,walkIn:r.attendanceStatus==="WALK_IN"||c?.checkinType==="WALK_IN"}}).sort((a,b)=>(a.checkedInAt??"9").localeCompare(b.checkedInAt??"9"))};
  }
  if(kind==="INTEGRATED"&&ctx.rights.ledger){
    const l=await buildLedger(eventId);
    if(l)snap.ledger={custodyBalance:l.custody.balance,storePaid:l.storePayments.paid,storeUnpaid:l.storePayments.unpaid,expenses:l.expenses.total,balance:l.balance};
  }
  return snap;
}
