import {CheckCircle2,Circle,MessageCircle} from "lucide-react";
import {lineLinkState} from "@/features/line/link";
import {lineLoginConfig} from "@/features/line/login";
import {unlinkMyLine} from "./line-self-actions";
type P={lineUserId:string|null;lineConnected:boolean;lineVerifiedAt:Date|null;friendStatus:string|null;lineLinkCode:string};
export function LineLinkPanel({token,participant}:{token:string;participant:P}){
  const state=lineLinkState(participant);
  const loginAvailable=Boolean(lineLoginConfig());
  const basicId=process.env.NEXT_PUBLIC_LINE_BASIC_ID;
  const steps=[
    {label:"LINEで本人確認",done:state.verified||(state.linked&&state.friend)},
    {label:"アカウントを紐付け",done:state.linked},
    {label:"公式アカウントを友だち追加",done:state.friend},
    {label:"通知を受け取れる状態",done:state.notifiable},
  ];
  return <div className="line-link-panel">
    <p className="line-link-title"><MessageCircle size={16}/> LINE連携</p>
    <ol className="line-steps">{steps.map(s=><li key={s.label} className={s.done?"is-done":""}>{s.done?<CheckCircle2 size={15}/>:<Circle size={15}/>}{s.label}</li>)}</ol>
    {state.notifiable&&<><p className="line-link-done"><CheckCircle2 size={16}/> LINE連携済み。入金確認やチケットのご案内はLINEに届きます。</p><form action={unlinkMyLine}><input type="hidden" name="token" value={token}/><button className="line-unlink">LINE連携を解除する</button></form></>}
    {state.stage==="BLOCKED"&&<p className="line-link-warn">公式アカウントをブロック、または友だち解除しています。通知を受け取るには、LINEで友だち追加（ブロック解除）をしてください。</p>}
    {state.stage==="LINKED_NOT_FRIEND"&&<p className="line-link-warn">LINEアカウントは紐付け済みですが、公式アカウントが友だち追加されていません。下のボタンから友だち追加してください。</p>}
    {!state.notifiable&&<>
      {loginAvailable&&<a className="line-primary" href={`/api/line/login/start?token=${encodeURIComponent(token)}`}><MessageCircle size={18}/>{state.linked?"LINEで連携をやり直す":"LINEで登録・連携する"}</a>}
      {basicId&&state.stage!=="NOT_LINKED"&&<a className="demo-ticket-link" href={`https://line.me/R/ti/p/%40${basicId}`} target="_blank" rel="noreferrer"><MessageCircle size={16}/>公式アカウントを友だち追加</a>}
      {!loginAvailable&&<p className="line-link-warn">LINEログインが未設定のため、下の連携コード方式をご利用ください。</p>}
      <details className="line-code-alt" open={!loginAvailable}><summary>LINEログインが使えない場合: 連携コードで連携</summary>
        <ol><li>LINEで「イベント管理通知」を友だち追加</li><li>トークでこの連携コードを送信：<code className="line-link-code">{participant.lineLinkCode}</code></li></ol>
        {basicId&&<a className="demo-ticket-link" href={`https://line.me/R/oaMessage/%40${basicId}/?${encodeURIComponent(participant.lineLinkCode)}`} target="_blank" rel="noreferrer"><MessageCircle size={16}/>LINEで連携する（コード入力済みで開く）</a>}
      </details>
    </>}
  </div>;
}
