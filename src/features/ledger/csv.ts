import {createCsv} from "@/features/exports/csv";
import type {Ledger} from "./data";
import {describeChange,EDIT_TYPE_LABEL} from "./edit-domain";
const jst=(d:Date)=>d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"});
export function ledgerCsv(l:Ledger){
  const summary:[string,number|string][]=[
    ["イベント",l.event.name],["開催日",l.event.eventDate.toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo"})],["作成日時",jst(l.generatedAt)],
    ["チケット売上(入金確認済)",l.tickets.sales],["請求額",l.tickets.billed],["未収金",l.tickets.receivable],["返金",l.tickets.refunded],
    ["集金担当の預り金残高",l.custody.balance],["内部送金(受領済)",l.remittances.reconciled],["内部送金(照合待ち)",l.remittances.unreconciled],
    ["参加費立替(未回収)",l.feeAdvances.outstanding],["参加費立替(予定)",l.feeAdvances.planned],["経費立替(未精算)",l.expenseAdvances.unsettled],["経費立替(予定)",l.expenseAdvances.planned],
    ["店舗支払(予定)",l.storePayments.planned],["店舗支払(支払済)",l.storePayments.paid],["店舗支払(未払い)",l.storePayments.unpaid],
    ["経費合計",l.expenses.total],["収支(売上-経費)",l.balance],
  ];
  const head=createCsv(["項目","金額"],summary);
  const body=createCsv(["日時","区分","内容","金額","状態","備考"],l.entries.map(e=>[jst(e.at),e.category,e.description,e.amount,e.status,e.note]));
  const history=l.revisions.length===0?"":`\r\n${createCsv(["編集日時","編集者","対象","変更内容","理由"],l.revisions.map(r=>[jst(r.at),r.editor,`${EDIT_TYPE_LABEL[r.type]}：${r.summary}`,r.changes.map(c=>describeChange(r.type,c)).join(" / "),r.reason])).replace(/^﻿/,"")}`;
  return `${head}\r\n${body.replace(/^﻿/,"")}${history}`;
}
