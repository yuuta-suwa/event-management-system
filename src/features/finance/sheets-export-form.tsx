"use client";
import {useActionState} from "react";
import {exportFinanceToSheets} from "./actions";
export function SheetsExportForm({year}:{year:number}){
  const [state,action,pending]=useActionState(exportFinanceToSheets,{});
  return <form action={action} className="sheets-export-form">
    <input type="hidden" name="year" value={year}/>
    <button disabled={pending}>{pending?"出力中…":"Googleスプレッドシートに出力"}</button>
    {state.message&&<small>{state.message}</small>}
  </form>;
}
