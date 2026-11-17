import {Bell} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {requireUser} from "@/server/authz";
import {db} from "@/server/db";
import {emailConfigured} from "@/features/email/provider";
import {listPendingLineFriends} from "@/features/line/data";
import {saveAdminNotificationPref,sendAdminTestNotice} from "@/features/admin-notify/actions";
import {DEFAULT_PREF} from "@/features/admin-notify/domain";
const notices:Record<string,string>={saved:"通知設定を保存しました。",test_sent:"テスト通知を送信しました。受信を確認してください。",demo:"ローカルデモでは保存されません。"};
const errors:Record<string,string>={invalid_line_id:"LINEユーザーIDの形式が正しくありません（Uから始まる33文字）。",line_needs_id:"LINEで受け取るには、LINEの宛先を選ぶか入力してください。",no_channel:"通知先が1つも有効になっていません。メールかLINEを有効にして保存してください。",test_failed:"テスト通知の送信に失敗しました。下の「最近の通知」でエラー内容を確認してください。",test_skipped:"一部の通知を送れませんでした（未設定）。下の「最近の通知」を確認してください。"};
const statusLabel:Record<string,string>={SENT:"送信済",FAILED:"失敗",SKIPPED:"送信しない",PENDING:"送信中"};
const jst=(d:Date)=>d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
/** 管理者・イベント担当者が、自分の「参加登録の通知」の受け取り方を設定する画面。 */
export default async function AdminNotificationSettingsPage({searchParams}:{searchParams:Promise<{notice?:string;error?:string}>}){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const q=await searchParams;
  const [row,friends,logs]=await Promise.all([
    db.adminNotificationPref.findUnique({where:{userId:user.id}}),
    listPendingLineFriends(),
    db.adminNotificationLog.findMany({where:{userId:user.id},orderBy:{createdAt:"desc"},take:15}),
  ]);
  const pref=row??DEFAULT_PREF;const mailReady=emailConfigured();
  const eventNames=new Map((await db.event.findMany({where:{id:{in:[...new Set(logs.map(l=>l.eventId))]}},select:{id:true,name:true}})).map(e=>[e.id,e.name]));
  return <><AppHeader active="settings"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">NOTIFICATION SETTINGS</p><h1>通知設定</h1><p>参加登録があるたびに、「参加登録が1件ありました」という通知を受け取れます。</p></div></div>
    {q.notice&&<div className="success-banner">{notices[q.notice]??"保存しました。"}</div>}
    {q.error&&<div className="form-banner" role="alert">{errors[q.error]??"処理に失敗しました。"}</div>}
    <section className="collection-section"><h2><Bell size={18}/> 参加登録の通知</h2>
      <p className="hint">通知を受け取れるのは、管理者（SUPER_ADMIN）と、そのイベントの担当者です。通知には氏名などの個人情報は含めず、イベント名と登録件数だけを送ります。詳細は、ログインが必要な参加者名簿で確認します。</p>
      <form action={saveAdminNotificationPref} className="settings-card">
        <label className="check-row"><input type="checkbox" name="registrationEmail" defaultChecked={pref.registrationEmail}/>メールで受け取る（宛先: あなたのログイン用メールアドレス）</label>
        {!mailReady&&<p className="hint">※ メール送信サービスが未設定のため、現在はメールは送られません（設定後に自動で送られます）。</p>}
        <label className="check-row"><input type="checkbox" name="registrationLine" defaultChecked={pref.registrationLine}/>LINEで受け取る</label>
        <label>LINEの宛先（公式アカウントを友だち追加した、あなたのLINE）<input name="lineUserId" list="admin-line-friends" defaultValue={pref.lineUserId??""} placeholder="一覧から選ぶか、Uから始まるIDを入力"/></label>
        <datalist id="admin-line-friends">{friends.map(f=><option key={f.id} value={f.lineUserId}>{f.displayName??"名前未取得"}</option>)}</datalist>
        <p className="hint">LINEで受け取るには、先に公式アカウントを友だち追加してください。追加すると、上の一覧にあなたの表示名が出ます。</p>
        <button>保存する</button>
      </form>
      <form action={sendAdminTestNotice} className="settings-card"><p className="hint">設定を保存したあと、実際に届くか確認できます（自分宛てだけに送ります）。</p><button>テスト通知を自分に送る</button></form>
    </section>
    <section className="collection-section"><h2>最近の通知</h2>
      {logs.length===0?<p className="hint">まだ通知の記録はありません。</p>:<table className="data-table"><thead><tr><th>日時</th><th>イベント</th><th>方法</th><th>結果</th></tr></thead><tbody>{logs.map(l=><tr key={l.id}><td>{jst(l.createdAt)}</td><td>{l.eventId==="test"?"（テスト）":eventNames.get(l.eventId)??"—"}</td><td>{l.channel==="EMAIL"?"メール":"LINE"}</td><td>{statusLabel[l.status]??l.status}{l.error&&<small>　{l.error}</small>}</td></tr>)}</tbody></table>}</section>
  </main></>;
}
