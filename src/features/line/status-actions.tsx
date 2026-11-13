"use client";
import {useActionState} from "react";
import {applyWebhookEndpoint,runWebhookTest,type DiagnosticsState} from "./diagnostics-actions";
export function LineStatusActions(){
  const [setState,setAction,setPending]=useActionState<DiagnosticsState>(applyWebhookEndpoint,{});
  const [testState,testAction,testPending]=useActionState<DiagnosticsState>(runWebhookTest,{});
  return <div className="line-status-actions">
    <form action={setAction}><button disabled={setPending}>{setPending?"設定中…":"Webhook URLを自動設定"}</button>{setState.message&&<small className={setState.ok?"ok":"ng"}>{setState.message}</small>}</form>
    <form action={testAction}><button disabled={testPending}>{testPending?"テスト中…":"Webhook接続テスト"}</button>{testState.message&&<small className={testState.ok?"ok":"ng"}>{testState.message}</small>}</form>
  </div>;
}
