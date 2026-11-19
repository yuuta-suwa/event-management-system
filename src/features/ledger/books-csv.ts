import {createCsv} from "@/features/exports/csv";
import type {BookView} from "./books";
const jst=(d:Date|null)=>d?d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}):"";
const day=(d:Date)=>d.toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo"});
/** 年次(月別集計＋イベント別)・月次(イベント別＋参加者履歴)のCSV。参加者は氏名・チケット番号・入金状態・受付/退出のみ。 */
export function bookCsv(b:BookView){
  const title=b.month?`${b.year}年${b.month}月`:`${b.year}年`;
  const events=createCsv(["開催日","イベント","販売枚数","入金済み枚数","チケット売上","未収金","参加人数(受付済み)"],b.events.map(e=>[day(e.date),e.name,e.tickets.sold,e.tickets.paid,e.tickets.sales,e.tickets.receivable,e.attended]));
  const head=createCsv(["期間","イベント数","販売枚数","入金済み枚数","チケット売上","参加人数"],[[title,b.summary.totals.events,b.summary.totals.sold,b.summary.totals.paid,b.summary.totals.sales,b.summary.totals.attended]]);
  const monthly=b.month?"":`\r\n${createCsv(["月","イベント数","販売枚数","入金済み枚数","チケット売上","参加人数"],b.summary.months.map(m=>[`${m.month}月`,m.events,m.sold,m.paid,m.sales,m.attended])).replace(/^﻿/,"")}`;
  const names=new Map(b.events.map(e=>[e.id,e.name]));
  const people=b.month?`\r\n${createCsv(["イベント","参加者","フリガナ","チケット番号","入金状態","受付時刻","退出時刻","退出理由"],b.attendees.map(a=>[names.get(a.eventId)??"",a.name,a.nameKana,a.ticketNumber,a.paymentStatus,jst(a.checkedInAt),jst(a.exitedAt),a.exitReason??""])).replace(/^﻿/,"")}`:"";
  return `${head}${monthly}\r\n${events.replace(/^﻿/,"")}${people}`;
}
