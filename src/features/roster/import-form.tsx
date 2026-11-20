"use client";
import {useActionState,useState} from "react";
import Link from "next/link";
import {submitRosterImport,type RosterImportState} from "./backfill-actions";
import {ATTEND_LABEL,COLUMN_LABEL,PAYMENT_LABEL,PAY_METHOD_LABEL,TEMPLATE_CSV} from "./backfill-domain";

export type EventChoice={id:string;label:string;price:number};
const statusLabel:Record<string,string>={NEW:"新規の方",EXISTING_PERSON:"名簿にいる方",ALREADY_REGISTERED:"登録済み（入力しません）",DUPLICATE_IN_PASTE:"重複（入力しません）",ERROR:"エラー"};
const templateHref=`data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${TEMPLATE_CSV}`)}`;

function Result({state}:{state:RosterImportState}){
  if(!state.result)return null;
  const {result}=state;const c=result.counts;
  return <section className="import-result" aria-live="polite">
    <h3>{result.committed?"登録しました":"確認結果（まだ登録していません）"}</h3>
    <p className="import-counts">{result.committed?"登録":"登録できる人"} <strong>{c.created}人</strong>（新規 {c.newPeople}／名簿にいる方 {c.existingPeople}）・入力しない {c.skipped}・エラー {c.errors}</p>
    {state.headerUsed&&state.columns&&<p className="ledger-note">1行目を見出しとして読みました：{state.columns.map(k=>COLUMN_LABEL[k]).join("・")}</p>}
    {!state.headerUsed&&!state.single&&<p className="ledger-note">見出しが見つからなかったため、テンプレートと同じ列の順（{Object.values(COLUMN_LABEL).join("・")}）で読みました。</p>}
    <div className="import-table-wrap"><table className="data-table"><thead><tr><th>行</th><th>名前</th><th>結果</th><th>入金</th><th>出欠</th><th>メモ</th></tr></thead><tbody>
      {result.results.map(r=><tr key={r.line} className={r.status==="ERROR"?"import-error":r.status==="NEW"||r.status==="EXISTING_PERSON"?"":"import-skip"}><td>{r.line}</td><td>{r.name}</td><td>{statusLabel[r.status]}{r.saved&&" ✓"}</td><td>{r.payment?PAYMENT_LABEL[r.payment as keyof typeof PAYMENT_LABEL]:""}</td><td>{r.attendance?ATTEND_LABEL[r.attendance as keyof typeof ATTEND_LABEL]:""}</td><td>{r.message??""}</td></tr>)}
    </tbody></table></div>
  </section>;
}

export function RosterImporter({events,initialEventId}:{events:EventChoice[];initialEventId?:string}){
  const [eventId,setEventId]=useState(initialEventId&&events.some(e=>e.id===initialEventId)?initialEventId:events[0]?.id??"");
  const [single,singleAction,singlePending]=useActionState<RosterImportState,FormData>(submitRosterImport,{});
  const [bulk,bulkAction,bulkPending]=useActionState<RosterImportState,FormData>(submitRosterImport,{});
  const sv=(k:string)=>single.values?.[k]??"",bv=(k:string)=>bulk.values?.[k]??"";
  const price=events.find(e=>e.id===eventId)?.price;
  if(events.length===0)return <div className="empty-state"><h2>入力できるイベントがありません</h2><p>先にイベントを作成してください（過去のイベントは「終了」の状態で作成できます）。</p><p><Link href="/events/new">イベントを作成する →</Link></p></div>;
  return <div className="roster-import">
    <section className="collection-section"><h2>① イベントを選ぶ</h2>
      <label className="import-event">記録を入れるイベント<select value={eventId} onChange={e=>setEventId(e.target.value)}>{events.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
      <p className="ledger-note">参加費（既定の金額）：{price===undefined?"—":`¥${price.toLocaleString("ja-JP")}`}。イベントがまだない場合は <Link href="/events/new">イベントを作成</Link>（過去の日付で作れます。状態は「終了」にしてください）。</p></section>

    <section className="collection-section"><h2>② まとめて貼り付ける（Excel・スプレッドシートからコピー）</h2>
      <p className="ledger-note">1行に1人。1行目に見出し（名前・フリガナ・電話・メール・入金・金額・入金日・入金方法・出欠・受付日時・紹介者・備考）があれば、列の順番は自由です。<strong>名前だけ</strong>あれば登録できます。空欄は下の既定の値で補います。<a download="参加者名簿テンプレート.csv" href={templateHref}>テンプレートをダウンロード</a></p>
      <form action={bulkAction} className="ledger-edit-form">
        <input type="hidden" name="eventId" value={eventId}/>
        <label>入金（既定）<select name="defPayment" defaultValue={bv("defPayment")||"PAID"}>{Object.entries(PAYMENT_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>出欠（既定）<select name="defAttendance" defaultValue={bv("defAttendance")||"ATTENDED"}>{Object.entries(ATTEND_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>入金方法（既定）<select name="defMethod" defaultValue={bv("defMethod")||"BANK_TRANSFER"}>{Object.entries(PAY_METHOD_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>金額（既定。空欄＝参加費）<input name="defAmount" inputMode="numeric" defaultValue={bv("defAmount")} placeholder={price===undefined?"":String(price)}/></label>
        <label className="wide">貼り付け欄（最大300人）<textarea name="data" rows={10} defaultValue={bv("data")} placeholder={"名前\tフリガナ\t電話\tメール\t入金\t金額\t入金日\t入金方法\t出欠\n山田 太郎\tヤマダ タロウ\t090-1234-5678\ttaro@example.com\t入金済み\t3000\t2026-01-10\t現金\t参加"} spellCheck={false}/></label>
        {bulk.message&&<div className="form-banner wide" role="alert">{bulk.message}</div>}
        <div className="ledger-edit-actions"><button name="intent" value="preview" disabled={bulkPending} className="ghost-btn">{bulkPending?"処理中…":"確認する（保存しません）"}</button><button name="intent" value="commit" disabled={bulkPending}>{bulkPending?"処理中…":"この内容で登録する"}</button></div>
      </form>
      <Result state={bulk}/>
    </section>

    <section className="collection-section"><h2>③ 1人ずつ追加する</h2>
      <form action={singleAction} className="ledger-edit-form">
        <input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="single" value="1"/>
        <label>名前（必須）<input name="name" required maxLength={100} defaultValue={sv("name")}/></label>
        <label>フリガナ（空欄なら名前と同じ）<input name="nameKana" maxLength={120} defaultValue={sv("nameKana")}/></label>
        <label>電話（任意）<input name="phone" type="tel" maxLength={24} defaultValue={sv("phone")}/></label>
        <label>メール（任意）<input name="email" type="email" defaultValue={sv("email")}/></label>
        <label>入金<select name="payment" defaultValue={sv("payment")||"入金済み"}>{Object.values(PAYMENT_LABEL).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <label>金額（空欄＝参加費）<input name="amount" inputMode="numeric" defaultValue={sv("amount")}/></label>
        <label>入金日（空欄＝開催日）<input name="paidAt" type="date" defaultValue={sv("paidAt")}/></label>
        <label>入金方法<select name="method" defaultValue={sv("method")||"銀行振込"}>{Object.values(PAY_METHOD_LABEL).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <label>出欠<select name="attendance" defaultValue={sv("attendance")||"参加"}>{["参加","欠席","未受付"].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <label>受付日時（空欄＝開始時刻）<input name="checkedInAt" type="datetime-local" defaultValue={sv("checkedInAt")}/></label>
        <label>紹介者（任意）<input name="introducer" maxLength={100} defaultValue={sv("introducer")}/></label>
        <label>備考（任意）<input name="notes" maxLength={1000} defaultValue={sv("notes")}/></label>
        {single.message&&<div className="form-banner wide" role="alert">{single.message}</div>}
        <div className="ledger-edit-actions"><button name="intent" value="preview" disabled={singlePending} className="ghost-btn">確認する（保存しません）</button><button name="intent" value="commit" disabled={singlePending}>{singlePending?"処理中…":"登録する"}</button></div>
      </form>
      <Result state={single}/>
    </section>
  </div>;
}
