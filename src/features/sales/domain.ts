export type SaleTicket={paymentStatus:string;amount:number};
export function summarizeSales(tickets:SaleTicket[]){const paid=tickets.filter(t=>t.paymentStatus==="PAID");return {revenue:paid.reduce((n,t)=>n+t.amount,0),paidCount:paid.length,average:paid.length?Math.round(paid.reduce((n,t)=>n+t.amount,0)/paid.length):0}}
