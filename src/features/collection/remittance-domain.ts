export type RemittanceStatus="PLANNED"|"SENT_REPORTED"|"RECEIVED"|"DISCREPANCY"|"CANCELLED";
export const remittanceStatusLabel:Record<RemittanceStatus,string>={PLANNED:"送金予定",SENT_REPORTED:"送金済み報告（受領確認待ち）",RECEIVED:"受領済み（照合完了）",DISCREPANCY:"差異あり",CANCELLED:"取消"};
const transitions:Record<RemittanceStatus,readonly RemittanceStatus[]>={
  PLANNED:["SENT_REPORTED","CANCELLED"],
  SENT_REPORTED:["RECEIVED","DISCREPANCY","CANCELLED"],
  DISCREPANCY:["RECEIVED","DISCREPANCY","CANCELLED"],
  RECEIVED:[],
  CANCELLED:[],
};
export function canTransitionRemittance(from:RemittanceStatus,to:RemittanceStatus){return transitions[from].includes(to)}
export function receiptOutcome(sentAmount:number,receivedAmount:number):"RECEIVED"|"DISCREPANCY"{return sentAmount===receivedAmount?"RECEIVED":"DISCREPANCY"}
type Row={status:string;amount:number};
const sum=(rows:Row[],statuses:string[])=>rows.filter(r=>statuses.includes(r.status)).reduce((n,r)=>n+r.amount,0);
export function committedRemittance(rows:Row[]){return sum(rows,["SENT_REPORTED","RECEIVED","DISCREPANCY"])}
export function unreconciledRemittance(rows:Row[]){return sum(rows,["SENT_REPORTED","DISCREPANCY"])}
export function reconciledRemittance(rows:Row[]){return sum(rows,["RECEIVED"])}
export function availableToRemit(input:{received:number;committed:number;offsets:number}){return Math.max(0,input.received-input.committed-input.offsets)}
export type StorePaymentStatus="UNPAID"|"PARTIALLY_PAID"|"PAID";
export function storePaymentStatus(planned:number,paid:number):StorePaymentStatus{if(paid<=0)return "UNPAID";return paid>=planned?"PAID":"PARTIALLY_PAID"}
export function storeUnpaid(planned:number,paid:number){return Math.max(0,planned-paid)}
export const storePaymentLabel:Record<StorePaymentStatus,string>={UNPAID:"未払い",PARTIALLY_PAID:"一部支払済み",PAID:"支払済み"};
