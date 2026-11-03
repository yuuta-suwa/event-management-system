import Link from "next/link";
import {CheckCircle2,CircleAlert,MessageCircle} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {runLineDiagnostics} from "@/features/line/diagnostics";
import {LineStatusActions} from "@/features/line/status-actions";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
export const dynamic="force-dynamic";
const overdueCutoff=()=>new Date(Date.now()-60*60*1000);
export default async function LineStatusPage(){
  await requireUser(["SUPER_ADMIN"]);
  const demo=isLocalDemo();
  const diagnostics=demo?null:await runLineDiagnostics();
  const stale=overdueCutoff();
  const [connected,pendingFriends,overdue,lastSent]=demo?[0,0,0,null]:await Promise.all([
    db.participant.count({where:{lineConnected:true,lineUserId:{not:null}}}),
    db.lineFriend.count({where:{matchStatus:"PENDING",status:"FOLLOWING"}}),
    db.notificationJob.count({where:{status:"PENDING",scheduledAt:{lt:stale}}}),
    db.notificationLog.findFirst({where:{status:"SENT"},orderBy:{createdAt:"desc"},select:{createdAt:true}}),
  ]);
  const failing=diagnostics?.checks.filter(c=>!c.ok&&c.key!=="env_login").length??0;
  return <><AppHeader active="notifications"/><main className="content-shell narrow">
    <div className="page-heading"><div><p className="eyebrow">LINE STATUS</p><h1>LINE接続の診断</h1><p>LINE公式アカウントとこのシステムの接続状態を確認します。</p></div><Link href="/notifications" className="secondary-link">LINE通知へ</Link></div>
    {!diagnostics?<div className="empty-state"><MessageCircle/><h2>ローカルデモでは診断できません</h2></div>:<>
      <div className={failing===0?"success-banner":"form-banner"} role="status">{failing===0?"LINEとの接続は正常です。":`${failing}件の要確認項目があります。下の一覧を確認してください。`}</div>
      <section className="detail-card line-status-card"><h2>接続チェック</h2>
        <ul className="line-checks">{diagnostics.checks.map(c=><li key={c.key} className={c.ok?"ok":c.key==="env_login"?"optional":"ng"}>{c.ok?<CheckCircle2/>:<CircleAlert/>}<span><strong>{c.label}</strong>{c.detail&&<small>{c.detail}</small>}</span></li>)}</ul>
        <LineStatusActions/>
        <p className="hint">「Webhook URLを自動設定」で、LINE側のWebhook URLを {diagnostics.expectedEndpoint} に設定します。「Webhookの利用」のオン／オフと「応答メッセージ」のオフは、LINE Developers／LINE Official Account Managerの画面での操作が必要です。</p>
      </section>
      <section className="detail-card line-status-card"><h2>運用状況</h2>
        <dl className="advance-card"><dt>LINE連携済みの参加者</dt><dd>{connected}人</dd><dt>未照合の友だち（仮登録）</dt><dd>{pendingFriends}人</dd><dt>最後の送信成功</dt><dd>{lastSent?lastSent.createdAt.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}):"まだありません"}</dd><dt>期限を過ぎた未送信ジョブ</dt><dd>{overdue}件{overdue>0&&"（通知の定期実行が動いていない可能性があります）"}</dd></dl>
      </section>
      <section className="detail-card line-status-card"><h2>LINE側でご自身が行う設定（チェックリスト）</h2>
        <ol className="line-steps"><li>LINE Developers → Messaging APIチャネル →「Messaging API設定」で「Webhookの利用」をオンにし、「検証」で成功を確認</li><li>LINE Official Account Manager →「応答設定」で「応答メッセージ」をオフ（アプリが自動で返信するため）</li><li>「あいさつメッセージ」は任意（アプリは友だち追加時に連携案内を返信します）</li><li>動作確認：ご自身のLINEで公式アカウントを友だち追加 → マイページの連携コード（8文字）をトークに送信 → 「LINE連携が完了しました」と返信されればOK</li></ol>
      </section></>}
  </main></>;
}
