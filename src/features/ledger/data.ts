import {db} from "@/server/db";
import {summarizeSales} from "@/features/sales/domain";
import {collectorCustody} from "@/features/collection/custody";
import {storePaymentStatus} from "@/features/collection/remittance-domain";

export type LedgerEntry={at:Date;category:string;description:string;amount:number;sign:1|-1|0;note:string|null;status:string};
export type Ledger={
  event:{id:string;name:string;eventDate:Date;venueName:string;price:number};
  generatedAt:Date;
  tickets:{count:number;billed:number;sales:number;receivable:number;refunded:number;paidCount:number};
  custody:{collected:number;remitted:number;offsets:number;balance:number;unreconciled:number};
  remittances:{reconciled:number;unreconciled:number;planned:number};
  feeAdvances:{total:number;recovered:number;outstanding:number};
  expenseAdvances:{total:number;settled:number;unsettled:number};
  storePayments:{planned:number;paid:number;unpaid:number};
  expenses:{total:number;count:number};
  balance:number;
  entries:LedgerEntry[];
};
const live={status:{notIn:["CANCELLED","EXPIRED"] as ("CANCELLED"|"EXPIRED")[]},paymentStatus:{notIn:["CANCELLED","REFUNDED"] as ("CANCELLED"|"REFUNDED")[]}};
/** 決裁権者専用の収支帳簿。呼び出し側で必ず assertLedgerAccess を通すこと。売上・入金・預り金・利益は別の項目として集計する。 */
export async function buildLedger(eventId:string):Promise<Ledger|null>{
  const event=await db.event.findUnique({where:{id:eventId},select:{id:true,name:true,eventDate:true,venueName:true,price:true}});
  if(!event)return null;
  const [tickets,refunds,expenses,receipts,remittances,plans,feeAdvances,expAdvances,collectorRows]=await Promise.all([
    db.ticket.findMany({where:{eventId,...live},select:{paymentStatus:true,payments:{orderBy:{createdAt:"desc"},take:1,select:{amount:true}}}}),
    db.payment.aggregate({where:{ticket:{eventId},status:"REFUNDED"},_sum:{amount:true}}),
    db.eventExpense.findMany({where:{eventId,voidedAt:null},orderBy:{createdAt:"asc"}}),
    db.collectionReceipt.findMany({where:{eventId},include:{collector:{select:{name:true}}},orderBy:{receivedAt:"asc"}}),
    db.remittance.findMany({where:{eventId},include:{sender:{select:{name:true}},recipient:{select:{name:true}}},orderBy:{createdAt:"asc"}}),
    db.storePayment.findMany({where:{eventId},include:{records:true},orderBy:{createdAt:"asc"}}),
    db.feeAdvance.findMany({where:{eventId},include:{recoveries:true},orderBy:{advancedAt:"asc"}}),
    db.expenseAdvance.findMany({where:{eventId},include:{settlements:true},orderBy:{paidAt:"asc"}}),
    db.collectionReceipt.groupBy({by:["collectorId"],where:{eventId,status:{not:"VOIDED"}}}),
  ]);
  const sales=summarizeSales(tickets.map(t=>({paymentStatus:t.paymentStatus,amount:t.payments[0]?.amount??event.price})));
  const billed=event.price*tickets.length;
  const custodies=await Promise.all(collectorRows.map(r=>collectorCustody(db,eventId,r.collectorId)));
  const custody=custodies.reduce((n,c)=>({collected:n.collected+c.received,remitted:n.remitted+c.committed,offsets:n.offsets+c.offsets,balance:n.balance+c.balance,unreconciled:n.unreconciled+c.unreconciled}),{collected:0,remitted:0,offsets:0,balance:0,unreconciled:0});
  const sumR=(statuses:string[])=>remittances.filter(r=>statuses.includes(r.status)).reduce((n,r)=>n+r.amount,0);
  const fee=feeAdvances.filter(f=>f.status!=="CANCELLED");
  const feeTotal=fee.reduce((n,f)=>n+f.amount,0),feeRecovered=fee.reduce((n,f)=>n+f.recoveries.reduce((m,r)=>m+r.amount,0),0);
  const exp=expAdvances.filter(e=>["APPROVED","PARTIALLY_SETTLED","SETTLED"].includes(e.status));
  const expTotal=exp.reduce((n,e)=>n+e.amount,0),expSettled=exp.reduce((n,e)=>n+e.settlements.reduce((m,s)=>m+s.amount,0),0);
  const activePlans=plans.filter(p=>p.status!=="CANCELLED").map(p=>{const paid=p.records.filter(r=>r.status==="RECORDED").reduce((n,r)=>n+r.amount,0);return {p,paid,status:storePaymentStatus(p.plannedAmount,paid)}});
  const storePaid=activePlans.reduce((n,x)=>n+x.paid,0),storePlanned=activePlans.reduce((n,x)=>n+x.p.plannedAmount,0);
  const expenseTotal=expenses.reduce((n,e)=>n+e.amount,0);
  const entries:LedgerEntry[]=[];
  for(const r of receipts)entries.push({at:r.receivedAt,category:"集金",description:`${r.payerName??"—"} → ${r.collector.name}`,amount:r.amount,sign:r.status==="VOIDED"?0:1,note:r.status==="VOIDED"?`取消: ${r.voidReason??""}`:r.note,status:r.status});
  for(const r of remittances)entries.push({at:r.sentAt??r.plannedAt??r.createdAt,category:"内部送金",description:`${r.sender.name} → ${r.recipient.name}`,amount:r.amount,sign:0,note:r.discrepancyNote??r.cancelReason??r.evidenceNote,status:r.status});
  for(const e of expenses)entries.push({at:e.createdAt,category:"経費",description:e.label,amount:e.amount,sign:-1,note:e.note,status:"RECORDED"});
  for(const x of plans)for(const r of x.records)entries.push({at:r.paidAt,category:"店舗支払",description:x.payee,amount:r.amount,sign:0,note:r.status==="VOIDED"?`取消: ${r.voidReason??""}`:[r.evidenceNote,r.receiptNote].filter(Boolean).join(" / ")||null,status:r.status});
  for(const f of feeAdvances)entries.push({at:f.advancedAt,category:"参加費立替",description:`${f.advancerName}が${f.obligorName}分を立替`,amount:f.amount,sign:0,note:f.evidenceNote,status:f.status});
  for(const e of expAdvances)entries.push({at:e.paidAt,category:"経費立替",description:`${e.advancerName}（${e.category}・${e.payee}）`,amount:e.amount,sign:0,note:e.evidenceNote,status:e.status});
  entries.sort((a,b)=>a.at.getTime()-b.at.getTime());
  return {event,generatedAt:new Date(),
    tickets:{count:tickets.length,billed,sales:sales.revenue,receivable:Math.max(0,billed-sales.revenue),refunded:refunds._sum.amount??0,paidCount:sales.paidCount},
    custody,remittances:{reconciled:sumR(["RECEIVED"]),unreconciled:sumR(["SENT_REPORTED","DISCREPANCY"]),planned:sumR(["PLANNED"])},
    feeAdvances:{total:feeTotal,recovered:feeRecovered,outstanding:feeTotal-feeRecovered},
    expenseAdvances:{total:expTotal,settled:expSettled,unsettled:expTotal-expSettled},
    storePayments:{planned:storePlanned,paid:storePaid,unpaid:storePlanned-storePaid},
    expenses:{total:expenseTotal,count:expenses.length},
    balance:sales.revenue-expenseTotal,entries};
}
