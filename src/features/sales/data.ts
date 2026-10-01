import {db} from "@/server/db";
import {isLocalDemo} from "@/server/authz";
import {profitOf,summarizeSales,sumExpenses} from "./domain";
export async function salesData(year:number){
  if(isLocalDemo()){
    const events=[
      {id:"demo-autumn",name:"秋のビジネス交流会 2026",date:new Date("2026-10-18"),revenue:360000,paidCount:36,average:10000,expense:138000,profit:222000},
      {id:"demo-summer",name:"夏の交流会 2026",date:new Date("2026-07-12"),revenue:288000,paidCount:36,average:8000,expense:95000,profit:193000},
    ];
    return assemble(year,events);
  }
  const rows=await db.event.findMany({where:{eventDate:{gte:new Date(`${year}-01-01T00:00:00+09:00`),lt:new Date(`${year+1}-01-01T00:00:00+09:00`)}},include:{tickets:{include:{payments:{orderBy:{createdAt:"desc"},take:1}}},expenses:true},orderBy:{eventDate:"asc"}});
  const events=rows.map(e=>{
    const s=summarizeSales(e.tickets.map(t=>({paymentStatus:t.paymentStatus,amount:t.payments[0]?.amount??e.price})));
    const expense=sumExpenses(e.expenses);
    return {id:e.id,name:e.name,date:e.eventDate,...s,expense,profit:profitOf(s.revenue,expense)};
  });
  return assemble(year,events);
}
function assemble(year:number,events:Array<{id:string;name:string;date:Date;revenue:number;paidCount:number;average:number;expense:number;profit:number}>){
  const months=Array.from({length:12},(_,i)=>({month:i+1,revenue:0,expense:0,profit:0}));
  for(const event of events){const m=months[event.date.getMonth()];m.revenue+=event.revenue;m.expense+=event.expense;m.profit+=event.profit}
  const revenue=events.reduce((n,e)=>n+e.revenue,0),paidCount=events.reduce((n,e)=>n+e.paidCount,0),expense=events.reduce((n,e)=>n+e.expense,0),profit=events.reduce((n,e)=>n+e.profit,0);
  return {year,events:[...events].sort((a,b)=>b.revenue-a.revenue),months,revenue,paidCount,average:paidCount?Math.round(revenue/paidCount):0,expense,profit};
}
