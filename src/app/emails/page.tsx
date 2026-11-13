import {Mail} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {requireUser} from "@/server/authz";
import {db} from "@/server/db";
import {emailConfigured} from "@/features/email/provider";
import {maskAddress} from "@/features/email/domain";
import {resendEmailByTicketNumber,retryEmail} from "@/features/email/actions";
const kindLabel:Record<string,string>={REGISTRATION_COMPLETE:"申込受付",TICKET_ACTIVATED:"入金確認・QR有効化",TRANSFER_RECEIVED:"譲渡受取",MANUAL_RESEND:"再送"};
const statusLabel:Record<string,string>={PENDING:"送信待ち",SENT:"送信済み",FAILED:"失敗",SKIPPED:"送信しない"};
const notices:Record<string,string>={resend_sent:"メールを送信しました。",resend_failed:"送信に失敗しました。下の履歴で理由を確認してください。",resend_skipped:"送信しませんでした（理由は履歴に表示）。",resend_retry:"送信に失敗したため、後で再試行します。",resend_queued:"送信を受け付けました。",demo:"ローカルデモでは送信しません。"};
const errors:Record<string,string>={invalid:"入力内容を確認してください。",not_found:"対象のチケットが見つかりません。",rate_limited:"再送は1チケットあたり24時間に3回までです。",not_resendable:"このチケットは再送できません（受取人が未定・取消済みなど）。",not_failed:"失敗したメールのみ再試行できます。"};
const jst=(d:Date|null)=>d?d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
export default async function EmailsPage({searchParams}:{searchParams:Promise<{notice?:string;error?:string}>}){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const q=await searchParams;
  const scope=user.role==="SUPER_ADMIN"?{}:{eventId:{in:(await db.event.findMany({where:{OR:[{managerId:user.id},{staff:{some:{userId:user.id}}}]},select:{id:true}})).map(e=>e.id)}};
  const [rows,counts]=await Promise.all([
    db.emailLog.findMany({where:scope,orderBy:{createdAt:"desc"},take:100}),
    db.emailLog.groupBy({by:["status"],where:scope,_count:true}),
  ]);
  const ticketNumbers=new Map((await db.ticket.findMany({where:{id:{in:rows.flatMap(r=>r.ticketId?[r.ticketId]:[])}},select:{id:true,ticketNumber:true}})).map(t=>[t.id,t.ticketNumber]));
  const count=(s:string)=>counts.find(c=>c.status===s)?._count??0;
  return <><AppHeader active="notifications"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">EMAIL DELIVERY</p><h1>メール配信</h1><p>QRチケット・受付コードのメール送信状況と再送を管理します。</p></div></div>
    {q.notice&&<div className="success-banner">{notices[q.notice]??"完了しました。"}</div>}
    {q.error&&<div className="form-banner" role="alert">{errors[q.error]??"処理に失敗しました。"}</div>}
    {!emailConfigured()&&<div className="form-banner">メール送信サービスが未設定です（環境変数 RESEND_API_KEY と EMAIL_FROM）。設定するまで送信はスキップされ、履歴に「送信しない」と記録されます。設定手順は docs/EMAIL_SETUP.md を参照してください。</div>}
    <section className="payment-summary"><article><Mail/><span>送信済み<strong>{count("SENT")}</strong></span></article><article><Mail/><span>送信待ち<strong>{count("PENDING")}</strong></span></article><article><Mail/><span>失敗<strong>{count("FAILED")}</strong></span></article><article><Mail/><span>送信しない<strong>{count("SKIPPED")}</strong></span></article></section>
    <section className="collection-section"><h2>チケットメールを再送</h2>
      <form action={resendEmailByTicketNumber} className="inline-form"><input name="ticketNumber" placeholder="チケット番号（例: EV-XXXX）" required maxLength={60}/><button>再送する</button></form>
      <p className="hint">現在の保有者の登録メールアドレスへ送ります。受取人が未定のチケット・取消済みチケット・失効したQRは送られません。再送は1チケット24時間に3回までです。</p></section>
    <section className="collection-section"><h2>送信履歴（直近100件）</h2>
      <table className="data-table"><thead><tr><th>日時</th><th>種別</th><th>チケット</th><th>宛先</th><th>状態</th><th>詳細</th><th></th></tr></thead><tbody>
        {rows.map(r=><tr key={r.id}><td>{jst(r.sentAt??r.createdAt)}</td><td>{kindLabel[r.kind]??r.kind}</td><td>{r.ticketId?ticketNumbers.get(r.ticketId):"—"}</td><td>{maskAddress(r.toEmail)}</td><td>{statusLabel[r.status]??r.status}{r.attempt>1&&`（${r.attempt}回目）`}</td><td>{r.errorMessage??""}</td><td>{r.status==="FAILED"&&<form action={retryEmail}><input type="hidden" name="logId" value={r.id}/><button className="line-unlink">再試行</button></form>}</td></tr>)}
      </tbody></table>
      {rows.length===0&&<div className="empty-state"><Mail/><h2>送信履歴はまだありません</h2></div>}</section>
  </main></>;
}
