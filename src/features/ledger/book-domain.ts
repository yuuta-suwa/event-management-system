// 年次・月次の帳簿(チケット販売記録＋参加人数＋参加者履歴)の集計。純粋関数。
export type BookTicket={status:string;paymentStatus:string;amount:number;attended:boolean};
export type EventBook={id:string;name:string;date:Date;month:number;price:number;capacity:number;tickets:{sold:number;paid:number;sales:number;billed:number;receivable:number};attended:number};
const DEAD_STATUS=new Set(["CANCELLED","EXPIRED"]);
const DEAD_PAYMENT=new Set(["CANCELLED","REFUNDED"]);
/** 販売記録: 取消・期限切れ・返金/キャンセル済みを除いた「有効なチケット」を数える。参加人数は受付済みの人数。 */
export function eventTicketBook(price:number,tickets:BookTicket[]){
  const live=tickets.filter(t=>!DEAD_STATUS.has(t.status)&&!DEAD_PAYMENT.has(t.paymentStatus));
  const paid=live.filter(t=>t.paymentStatus==="PAID");
  const sales=paid.reduce((n,t)=>n+t.amount,0);
  const billed=price*live.length;
  return {tickets:{sold:live.length,paid:paid.length,sales,billed,receivable:Math.max(0,billed-sales)},attended:live.filter(t=>t.attended).length};
}
export const jstMonth=(d:Date)=>new Date(d.getTime()+9*3600_000).getUTCMonth()+1;
export const jstYear=(d:Date)=>new Date(d.getTime()+9*3600_000).getUTCFullYear();
/** 期間(JST)の開始・終了。monthを省略すると1年間。 */
export function periodRange(year:number,month?:number){
  const m=month&&month>=1&&month<=12?month:undefined;
  const start=new Date(`${year}-${String(m??1).padStart(2,"0")}-01T00:00:00+09:00`);
  const end=m?new Date(`${m===12?year+1:year}-${String(m===12?1:m+1).padStart(2,"0")}-01T00:00:00+09:00`):new Date(`${year+1}-01-01T00:00:00+09:00`);
  return {start,end};
}
export type MonthRow={month:number;events:number;sold:number;paid:number;sales:number;attended:number};
export function summarizeBook(events:EventBook[]){
  const months:MonthRow[]=Array.from({length:12},(_,i)=>({month:i+1,events:0,sold:0,paid:0,sales:0,attended:0}));
  for(const e of events){const m=months[e.month-1];m.events++;m.sold+=e.tickets.sold;m.paid+=e.tickets.paid;m.sales+=e.tickets.sales;m.attended+=e.attended}
  const totals=months.reduce((a,m)=>({events:a.events+m.events,sold:a.sold+m.sold,paid:a.paid+m.paid,sales:a.sales+m.sales,attended:a.attended+m.attended}),{events:0,sold:0,paid:0,sales:0,attended:0});
  return {months,totals};
}
export type Attendee={eventId:string;name:string;nameKana:string;ticketNumber:string;paymentStatus:string;checkedInAt:Date|null;exitedAt:Date|null;exitReason:string|null};
