import { notFound } from "next/navigation";
import { Banknote, Receipt } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { getEvent } from "@/features/events/data";
import { addExpense, deleteExpense } from "@/features/events/expense-actions";
import { listExpenses } from "@/features/events/expense-data";
import { requireUser } from "@/server/authz";
export default async function ExpensesPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{notice?:string}>}){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const{id}=await params;
  const[event,expenses,{notice}]=await Promise.all([getEvent(id,user),listExpenses(id),searchParams]);
  if(!event)notFound();
  const total=expenses.reduce((n,e)=>n+e.amount,0);
  return <><AppHeader active="events"/><main className="content-shell"><div className="page-heading"><div><p className="eyebrow">EVENT EXPENSES</p><h1>経費管理</h1><p>{event.name}</p></div></div>
  {notice&&<div className="success-banner">{notice==="demo"?"ローカルデモでは経費を保存せず、操作フローだけ確認できます。":notice==="deleted"?"経費を削除しました。":"経費を追加しました。"}</div>}
  <section className="allocation-summary"><article><Receipt/><span>経費合計<strong>¥{total.toLocaleString("ja-JP")}</strong></span></article><article><Banknote/><span>登録件数<strong>{expenses.length}件</strong></span></article></section>
  <form action={addExpense.bind(null,id)} className="expense-form"><label>項目名<input name="label" placeholder="例：会場費" required maxLength={60}/></label><label>金額（円）<input name="amount" type="number" min="0" required/></label><label>メモ（任意）<input name="note" placeholder="例：前払い分" maxLength={300}/></label><button>追加</button></form>
  <div className="expense-table-wrap"><table className="expense-table"><thead><tr><th>項目名</th><th>金額</th><th>メモ</th><th>登録日</th><th></th></tr></thead><tbody>{expenses.map(e=><tr key={e.id}><td>{e.label}</td><td>¥{e.amount.toLocaleString("ja-JP")}</td><td>{e.note??"—"}</td><td>{e.createdAt.toLocaleDateString("ja-JP")}</td><td><form action={deleteExpense.bind(null,id)}><input type="hidden" name="expenseId" value={e.id}/><button className="ghost-button">削除</button></form></td></tr>)}</tbody></table>{expenses.length===0&&<div className="empty-state"><Receipt/><h2>まだ経費が登録されていません</h2></div>}</div>
  </main></>;
}
