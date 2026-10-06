"use server";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
import {salesData} from "@/features/sales/data";
import {writeFinanceSheet} from "./sheets";
export async function exportFinanceToSheets(_:{message?:string},formData:FormData):Promise<{message?:string}>{
  const user=await requireUser(["SUPER_ADMIN"]);
  const year=Number(formData.get("year"))||new Date().getFullYear();
  if(isLocalDemo())return {message:"ローカルデモでは出力しません。"};
  const data=await salesData(year);
  const rows:(string|number)[][]=[
    [`${year}年 月別収支`],
    ["月","収入","支出","収支"],
    ...data.months.map(m=>[`${m.month}月`,m.revenue,m.expense,m.profit]),
    ["合計",data.revenue,data.expense,data.profit],
    [],
    ["イベント別収支"],
    ["イベント名","開催日","収入","支出","収支"],
    ...data.events.map(e=>[e.name,e.date.toLocaleDateString("ja-JP"),e.revenue,e.expense,e.profit]),
  ];
  try{
    await writeFinanceSheet(rows);
    await db.auditLog.create({data:{actorId:user.id,action:"FINANCE_EXPORTED_TO_SHEETS",entityType:"Event",entityId:`year-${year}`,after:{year}}});
    return {message:"Googleスプレッドシートに出力しました。"};
  }catch(error){
    return {message:`出力に失敗しました：${error instanceof Error?error.message:"UNKNOWN_ERROR"}`};
  }
}
