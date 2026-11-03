import {db} from "@/server/db";
import {isLocalDemo} from "@/server/authz";
import {loadEventAccess} from "./access";
import {custodyBalance,targetSummary,type CollectionStatus,type EventAccess} from "./domain";
export type CollectionGroup={key:string;label:string;ticketCount:number;ticketNumbers:string[];collectorId:string|null;collectorName:string|null;billed:number;received:number;unpaid:number;status:CollectionStatus;manualPaid:boolean};
export type ReceiptRow={id:string;receivedAt:Date;amount:number;method:string;payerName:string|null;collectorName:string;status:string;voidReason:string|null;targetLabel:string;note:string|null;collectorId:string};
export type CollectionView={event:{id:string;name:string;price:number};access:EventAccess;groups:CollectionGroup[];totals:{billed:number;received:number;unpaid:number};collectors:{userId:string;name:string}[];candidates:{id:string;name:string;role:string}[];custody:{collectorId:string;name:string;received:number;remitted:number;balance:number}[];receipts:ReceiptRow[]};
const live={status:{notIn:["CANCELLED","EXPIRED"] as ("CANCELLED"|"EXPIRED")[]},paymentStatus:{notIn:["CANCELLED","REFUNDED"] as ("CANCELLED"|"REFUNDED")[]}};
export async function getCollectionView(user:{id:string;role:string},eventId:string):Promise<CollectionView|null>{
  if(isLocalDemo())return null;
  const ctx=await loadEventAccess(user,eventId);
  if(!ctx||!ctx.access.canView)return null;
  const {event,access}=ctx;
  const tickets=await db.ticket.findMany({where:{eventId,...live,...(access.manager?{}:{collectorId:user.id})},include:{participant:true,order:{include:{buyer:true}},collector:{select:{id:true,name:true}}},orderBy:{ticketNumber:"asc"}});
  const orderIds=[...new Set(tickets.flatMap(t=>t.orderId?[t.orderId]:[]))];
  const soloIds=tickets.filter(t=>!t.orderId).map(t=>t.id);
  const receipts=orderIds.length||soloIds.length?await db.collectionReceipt.findMany({where:{eventId,OR:[{orderId:{in:orderIds}},{ticketId:{in:soloIds}}]},include:{collector:{select:{name:true}}},orderBy:{receivedAt:"desc"}}):[];
  const groupsMap=new Map<string,typeof tickets>();
  for(const t of tickets){const key=t.orderId?`order:${t.orderId}`:`ticket:${t.id}`;groupsMap.set(key,[...(groupsMap.get(key)??[]),t])}
  const labelOf=new Map<string,string>();
  const groups:CollectionGroup[]=[...groupsMap.entries()].map(([key,list])=>{
    const label=list[0].order?.buyer.name??list[0].participant.name;labelOf.set(key,label);
    const amounts=receipts.filter(r=>r.status!=="VOIDED"&&(key.startsWith("order:")?r.orderId===key.slice(6):r.ticketId===key.slice(7))).map(r=>r.amount);
    const s=targetSummary(event.price,list,amounts);
    const first=list[0].collector;const uniform=Boolean(first)&&list.every(x=>x.collectorId===first!.id);
    return {key,label,ticketCount:list.length,ticketNumbers:list.map(x=>x.ticketNumber),collectorId:uniform?first!.id:null,collectorName:uniform?first!.name:null,billed:s.billed,received:s.received,unpaid:s.unpaid,status:s.status,manualPaid:s.manualPaid};
  });
  const totals=groups.reduce((n,g)=>({billed:n.billed+g.billed,received:n.received+g.received,unpaid:n.unpaid+g.unpaid}),{billed:0,received:0,unpaid:0});
  const assigned=await db.eventRoleAssignment.findMany({where:{eventId,role:"COLLECTOR",active:true},include:{user:{select:{id:true,name:true}}}});
  const candidates=access.manager?(await db.user.findMany({where:{role:{not:"PARTICIPANT"},status:"ACTIVE",id:{notIn:assigned.map(a=>a.userId)}},select:{id:true,name:true,role:true},orderBy:{name:"asc"},take:100})):[];
  const custodyRows=await db.collectionReceipt.groupBy({by:["collectorId"],where:{eventId,status:{not:"VOIDED"},...(access.manager?{}:{collectorId:user.id})},_sum:{amount:true}});
  const names=new Map(assigned.map(a=>[a.userId,a.user.name]));
  const missing=custodyRows.map(r=>r.collectorId).filter(id=>!names.has(id));
  if(missing.length)for(const u of await db.user.findMany({where:{id:{in:missing}},select:{id:true,name:true}}))names.set(u.id,u.name);
  const custody=custodyRows.map(r=>({collectorId:r.collectorId,name:names.get(r.collectorId)??"",received:r._sum.amount??0,remitted:0,balance:custodyBalance({received:r._sum.amount??0})}));
  const rows:ReceiptRow[]=receipts.filter(r=>access.manager||r.collectorId===user.id).slice(0,60).map(r=>({id:r.id,receivedAt:r.receivedAt,amount:r.amount,method:r.method,payerName:r.payerName,collectorName:r.collector.name,status:r.status,voidReason:r.voidReason,targetLabel:labelOf.get(r.orderId?`order:${r.orderId}`:`ticket:${r.ticketId}`)??"",note:r.note,collectorId:r.collectorId}));
  return {event:{id:event.id,name:event.name,price:event.price},access,groups,totals,collectors:assigned.map(a=>({userId:a.userId,name:a.user.name})),candidates,custody,receipts:rows};
}
export type FeeAdvanceRow={id:string;obligorName:string;advancerName:string;amount:number;recovered:number;outstanding:number;status:string;advancedAt:Date;evidenceNote:string|null;createdBy:string;recoveries:{id:string;amount:number;recoveredAt:Date;method:string}[]};
export type ExpenseAdvanceRow={id:string;advancerName:string;category:string;payee:string;amount:number;settled:number;unsettled:number;status:string;paidAt:Date;evidenceNote:string|null;requestedBy:string;returnReason:string|null;expenseRecognized:boolean;settlements:{id:string;amount:number;settledAt:Date}[]};
export type AdvancesView={event:{id:string;name:string};access:EventAccess;targets:{key:string;label:string}[];feeAdvances:FeeAdvanceRow[];expenseAdvances:ExpenseAdvanceRow[];totals:{feeOutstanding:number;expenseUnsettled:number;expenseApproved:number}};
export async function getAdvancesView(user:{id:string;role:string},eventId:string):Promise<AdvancesView|null>{
  if(isLocalDemo())return null;
  const ctx=await loadEventAccess(user,eventId);
  if(!ctx||!ctx.access.canView)return null;
  const {event,access}=ctx;const seeAll=access.manager||access.approver;
  const feeRows=await db.feeAdvance.findMany({where:{eventId,...(seeAll?{}:{createdBy:user.id})},include:{recoveries:{orderBy:{recoveredAt:"asc"}}},orderBy:{advancedAt:"desc"}});
  const expRows=await db.expenseAdvance.findMany({where:{eventId,...(seeAll?{}:{requestedBy:user.id})},include:{settlements:{orderBy:{settledAt:"asc"}}},orderBy:{paidAt:"desc"}});
  const feeAdvances:FeeAdvanceRow[]=feeRows.map(f=>{const recovered=f.recoveries.reduce((n,r)=>n+r.amount,0);return {id:f.id,obligorName:f.obligorName,advancerName:f.advancerName,amount:f.amount,recovered,outstanding:f.status==="CANCELLED"?0:f.amount-recovered,status:f.status,advancedAt:f.advancedAt,evidenceNote:f.evidenceNote,createdBy:f.createdBy,recoveries:f.recoveries.map(r=>({id:r.id,amount:r.amount,recoveredAt:r.recoveredAt,method:r.method}))}});
  const expenseAdvances:ExpenseAdvanceRow[]=expRows.map(e=>{const settled=e.settlements.reduce((n,s)=>n+s.amount,0);return {id:e.id,advancerName:e.advancerName,category:e.category,payee:e.payee,amount:e.amount,settled,unsettled:["APPROVED","PARTIALLY_SETTLED"].includes(e.status)?e.amount-settled:0,status:e.status,paidAt:e.paidAt,evidenceNote:e.evidenceNote,requestedBy:e.requestedBy,returnReason:e.returnReason,expenseRecognized:Boolean(e.expenseId),settlements:e.settlements.map(s=>({id:s.id,amount:s.amount,settledAt:s.settledAt}))}});
  const tickets=await db.ticket.findMany({where:{eventId,...live,...(access.manager?{}:{collectorId:user.id})},include:{participant:true,order:{include:{buyer:true}}},orderBy:{ticketNumber:"asc"}});
  const seen=new Map<string,string>();
  for(const t of tickets){const key=t.orderId?`order:${t.orderId}`:`ticket:${t.id}`;if(!seen.has(key))seen.set(key,t.order?.buyer.name??t.participant.name)}
  return {event:{id:event.id,name:event.name},access,targets:[...seen.entries()].map(([key,label])=>({key,label})),feeAdvances,expenseAdvances,totals:{feeOutstanding:feeAdvances.reduce((n,f)=>n+f.outstanding,0),expenseUnsettled:expenseAdvances.reduce((n,e)=>n+e.unsettled,0),expenseApproved:expenseAdvances.filter(e=>["APPROVED","PARTIALLY_SETTLED","SETTLED"].includes(e.status)).reduce((n,e)=>n+e.amount,0)}};
}
