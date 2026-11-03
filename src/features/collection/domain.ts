export const receiptMethods:Record<string,string>={CASH:"現金",BANK_TRANSFER:"銀行振込",ONLINE:"オンライン決済",OTHER:"その他"};
export type CollectionStatus="UNPAID"|"PARTIAL"|"PAID"|"OVERPAID";
export function summarizeBilling(billed:number,receiptAmounts:number[]){
  const received=receiptAmounts.reduce((n,a)=>n+a,0);
  const unpaid=Math.max(0,billed-received);
  const status:CollectionStatus=received<=0?"UNPAID":received<billed?"PARTIAL":received===billed?"PAID":"OVERPAID";
  return {billed,received,unpaid,status};
}
export function custodyBalance(input:{received:number;remitted?:number;offsets?:number}){return input.received-(input.remitted??0)-(input.offsets??0)}
export type FeeAdvanceStatus="OPEN"|"PARTIALLY_RECOVERED"|"RECOVERED"|"CANCELLED";
export function feeAdvanceStatus(amount:number,recovered:number,cancelled=false):FeeAdvanceStatus{
  if(cancelled)return "CANCELLED";
  if(recovered<=0)return "OPEN";
  return recovered>=amount?"RECOVERED":"PARTIALLY_RECOVERED";
}
export type ExpenseAdvanceStatus="REQUESTED"|"REVIEWING"|"APPROVED"|"PARTIALLY_SETTLED"|"SETTLED"|"RETURNED"|"CANCELLED";
export const expenseStatusLabel:Record<ExpenseAdvanceStatus,string>={REQUESTED:"申請中",REVIEWING:"確認中",APPROVED:"承認済み",PARTIALLY_SETTLED:"一部精算済み",SETTLED:"精算済み",RETURNED:"差戻し",CANCELLED:"取消"};
const transitions:Record<ExpenseAdvanceStatus,readonly ExpenseAdvanceStatus[]>={
  REQUESTED:["REVIEWING","APPROVED","RETURNED","CANCELLED"],
  REVIEWING:["APPROVED","RETURNED","CANCELLED"],
  APPROVED:["PARTIALLY_SETTLED","SETTLED"],
  PARTIALLY_SETTLED:["PARTIALLY_SETTLED","SETTLED"],
  RETURNED:["REQUESTED","CANCELLED"],
  SETTLED:[],
  CANCELLED:[],
};
export function canTransitionExpense(from:ExpenseAdvanceStatus,to:ExpenseAdvanceStatus){return transitions[from].includes(to)}
export function settlementStatus(amount:number,settled:number):"APPROVED"|"PARTIALLY_SETTLED"|"SETTLED"{
  if(settled<=0)return "APPROVED";
  return settled>=amount?"SETTLED":"PARTIALLY_SETTLED";
}
export function unsettled(amount:number,settled:number){return Math.max(0,amount-settled)}
export type AccessInput={role:string;userId:string;managerId:string;assignments:{userId:string;role:"COLLECTOR"|"APPROVER";active:boolean}[]};
export type EventAccess={manager:boolean;collector:boolean;approver:boolean;approverFallback:boolean;canView:boolean};
export function decideAccess(input:AccessInput):EventAccess{
  const active=input.assignments.filter(a=>a.active);
  const manager=input.role==="SUPER_ADMIN"||(input.role==="EVENT_MANAGER"&&input.managerId===input.userId);
  const collector=active.some(a=>a.userId===input.userId&&a.role==="COLLECTOR");
  const explicitApprover=active.some(a=>a.userId===input.userId&&a.role==="APPROVER");
  const approverFallback=!explicitApprover&&input.role==="SUPER_ADMIN"&&!active.some(a=>a.role==="APPROVER");
  const approver=explicitApprover||approverFallback;
  return {manager,collector,approver,approverFallback,canView:manager||collector||approver};
}
export function targetSummary(price:number,tickets:{paymentStatus:string}[],receiptAmounts:number[]){
  const billed=price*tickets.length;
  const paidCount=tickets.filter(t=>t.paymentStatus==="PAID").length;
  const receipts=receiptAmounts.reduce((n,a)=>n+a,0);
  const allPaid=tickets.length>0&&paidCount===tickets.length;
  if(allPaid){
    const received=receipts>=billed?receipts:billed;
    return {billed,received,unpaid:0,status:(received>billed?"OVERPAID":"PAID") as CollectionStatus,manualPaid:receipts<billed};
  }
  const received=receipts+paidCount*price;
  return {...summarizeBilling(billed,[received]),manualPaid:false};
}
