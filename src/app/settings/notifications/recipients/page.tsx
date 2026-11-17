import Link from "next/link";
import {Search,UserPlus} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {requireUser} from "@/server/authz";
import {db} from "@/server/db";
import {addNotificationRecipient,removeNotificationRecipient,setNotificationRecipientActive,testNotificationRecipient} from "@/features/admin-notify/recipient-actions";
const notices:Record<string,string>={added:"通知の宛先に追加しました。以降、参加登録のたびにこの人のLINEへ通知が届きます。",paused:"一時停止しました。再開するまで通知は届きません。",resumed:"再開しました。",removed:"宛先から削除しました。",test_sent:"テスト通知を送信しました。本人のLINEに届いたか確認してください。",demo:"ローカルデモでは保存されません。"};
const errors:Record<string,string>={invalid:"操作を確認してください。",not_found:"対象が見つかりません。",not_linked:"この参加者はLINE連携が完了していないため、追加できません。",already:"すでに宛先に追加されています。",test_failed:"テスト通知の送信に失敗しました。下の「最近の結果」を確認してください。",test_skipped:"LINE連携が解除されているため送れませんでした。"};
const statusLabel:Record<string,string>={SENT:"送信済",FAILED:"失敗",SKIPPED:"送れず",PENDING:"送信中"};
const jst=(d:Date)=>d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
/** 管理者(SUPER_ADMIN)が、LINE連携済みの参加者から「参加登録の通知を受け取る人」を追加・管理する画面。 */
export default async function NotificationRecipientsPage({searchParams}:{searchParams:Promise<{q?:string;notice?:string;error?:string}>}){
  await requireUser(["SUPER_ADMIN"]);
  const q=(await searchParams);const term=q.q?.trim();
  const [current,candidates]=await Promise.all([
    db.adminNotificationRecipient.findMany({orderBy:{createdAt:"asc"},include:{participant:{select:{name:true,nameKana:true,lineConnected:true,lineUserId:true}}}}),
    db.participant.findMany({where:{lineConnected:true,lineUserId:{not:null},adminNotificationRecipient:{is:null},...(term?{OR:[{name:{contains:term,mode:"insensitive"}},{nameKana:{contains:term,mode:"insensitive"}}]}:{})},orderBy:{nameKana:"asc"},take:30,select:{id:true,name:true,nameKana:true,registrations:{take:1,orderBy:{appliedAt:"desc"},select:{event:{select:{name:true}}}}}}),
  ]);
  const logs=await db.adminNotificationLog.findMany({where:{userId:{in:current.map(c=>`recipient:${c.id}`)}},orderBy:{createdAt:"desc"},take:40});
  const last=new Map<string,typeof logs[number]>();for(const l of logs)if(!last.has(l.userId))last.set(l.userId,l);
  return <><AppHeader active="settings"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">NOTIFICATION RECIPIENTS</p><h1>通知の宛先を追加</h1><p>LINE連携済みの参加者を選んで、「参加登録が1件ありました」の通知を受け取る人に追加できます（全イベントの通知が届きます）。</p></div></div>
    <p className="collection-links"><Link href="/settings/notifications">← 自分の通知設定へ</Link></p>
    {q.notice&&<div className="success-banner">{notices[q.notice]??"保存しました。"}</div>}
    {q.error&&<div className="form-banner" role="alert">{errors[q.error]??"処理に失敗しました。"}</div>}
    <section className="collection-section"><h2>現在の宛先（{current.length}人）</h2>
      {current.length===0?<p className="hint">まだ追加されていません。下の一覧から追加してください。</p>:<table className="data-table"><thead><tr><th>名前</th><th>状態</th><th>最近の結果</th><th>操作</th></tr></thead><tbody>{current.map(c=>{const l=last.get(`recipient:${c.id}`);const linked=c.participant.lineConnected&&Boolean(c.participant.lineUserId);return <tr key={c.id}>
        <td><strong>{c.participant.name}</strong><small>{c.participant.nameKana}</small></td>
        <td>{!linked?"LINE連携が解除されています":c.active?"通知する":"一時停止中"}</td>
        <td>{l?<>{statusLabel[l.status]??l.status}（{jst(l.createdAt)}）{l.error&&<small>　{l.error}</small>}</>:"—"}</td>
        <td><div className="inline-form">
          <form action={testNotificationRecipient}><input type="hidden" name="id" value={c.id}/><button>テスト通知</button></form>
          {c.active?<form action={setNotificationRecipientActive.bind(null,false)}><input type="hidden" name="id" value={c.id}/><button className="line-unlink">一時停止</button></form>:<form action={setNotificationRecipientActive.bind(null,true)}><input type="hidden" name="id" value={c.id}/><button>再開</button></form>}
          <form action={removeNotificationRecipient}><input type="hidden" name="id" value={c.id}/><button className="line-unlink">削除</button></form></div></td></tr>})}</tbody></table>}
      <p className="hint">宛先のLINEは、送るたびにその人の現在のLINE連携から取得します。本人がLINE連携を解除した場合は送られません。</p></section>
    <section className="collection-section"><h2><UserPlus size={18}/> 宛先に追加する</h2>
      <form className="participant-search"><Search/><input name="q" defaultValue={term} placeholder="名前・フリガナで探す"/><button>検索</button></form>
      {candidates.length===0?<p className="hint">{term?"該当する、LINE連携済みの参加者はいません。":"追加できる、LINE連携済みの参加者がいません。"}</p>:<table className="data-table"><thead><tr><th>名前</th><th>直近の申込イベント</th><th></th></tr></thead><tbody>{candidates.map(c=><tr key={c.id}>
        <td><strong>{c.name}</strong><small>{c.nameKana}</small></td><td>{c.registrations[0]?.event.name??"—"}</td>
        <td><form action={addNotificationRecipient}><input type="hidden" name="participantId" value={c.id}/><button className="secondary-link">追加</button></form></td></tr>)}</tbody></table>}
      <p className="hint">一覧に出るのは、LINE連携が完了（通知を受け取れる状態）の参加者だけです。同姓同名の場合は、直近の申込イベントで見分けてください。追加すると、その人にも「イベント名と登録件数」が届きます（氏名・連絡先は含まれません）。</p></section>
  </main></>;
}
