import {notFound} from "next/navigation";
import Link from "next/link";
import {CalendarDays,MapPin,ShieldCheck,TicketCheck,Users} from "lucide-react";
import {getMyRegistration} from "@/features/participants/my-registration";
import {issueTicketToken,qrTokenSecret} from "@/features/tickets/token";
import {MyDetailsForm,CancelRegistrationForm} from "@/features/participants/self-service-form";
import {cancelMyRegistration} from "@/features/participants/self-service-actions";
import {ensureReceptionCode,formatReceptionCode} from "@/features/checkins/reception-code";
import {isLocalDemo} from "@/server/authz";
import {resendMyTicketEmail} from "@/features/participants/email-self-actions";
import {LineLinkPanel} from "@/features/participants/line-link-panel";
import {ShareLinkPanel} from "@/features/participants/share-link-panel";
const attendanceLabel:Record<string,string>={APPLIED:"申込済",PAID:"入金済",EXPECTED:"参加予定",CHECKED_IN:"受付済",ABSENT:"欠席",CANCELLED:"キャンセル済み",WALK_IN:"当日参加"};
const paymentLabel:Record<string,string>={PAID:"入金済",PENDING:"入金確認中",UNPAID:"未入金",CANCELLED:"キャンセル",REFUNDED:"返金済"};
const attendanceBadgeClass:Record<string,string>={APPLIED:"status-published",PAID:"status-published",EXPECTED:"status-published",CHECKED_IN:"status-published",WALK_IN:"status-published",ABSENT:"status-cancelled",CANCELLED:"status-cancelled"};
export default async function MyRegistrationPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{notice?:string}>}){
  const [{token},{notice}]=await Promise.all([params,searchParams]);
  const data=await getMyRegistration(token);
  if(!data)notFound();
  const locked=data.attendanceStatus==="CANCELLED"||data.ticket?.checkedIn;
  const ticketReady=data.ticket&&["ACTIVE","USED"].includes(data.ticket.status);
  const receptionCode=ticketReady&&data.ticket!.status==="ACTIVE"&&!locked&&!isLocalDemo()?await ensureReceptionCode(data.ticket!.id):null;
  return <main className="public-shell">
    <header className="public-brand">EVENT MANAGEMENT SYSTEM</header>
    <section className="application-layout">
      <aside className="application-event">
        <span className={`status-badge ${attendanceBadgeClass[data.attendanceStatus]}`}>{attendanceLabel[data.attendanceStatus]}</span>
        <p className="eyebrow">MY REGISTRATION</p>
        <h1>{data.event.name}</h1>
        <div className="public-event-info">
          <p><CalendarDays/>{data.event.eventDate.toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric",weekday:"short"})}<small>{data.event.startTime.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}–{data.event.endTime.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}</small></p>
          <p><MapPin/>{data.event.venueName}<small>{data.event.address}</small></p>
        </div>
        {data.ticket&&<div className="introducer">チケットNo. <code>{data.ticket.ticketNumber}</code>{data.purchasedBy&&<><br/>購入者：{data.purchasedBy} さん</>}</div>}
        <div className="price-panel"><span>参加費</span><strong>¥{data.event.price.toLocaleString("ja-JP")}</strong></div>
        {ticketReady&&<Link className="demo-ticket-link" href={`/ticket/${issueTicketToken(data.ticket!.id,data.ticket!.version,qrTokenSecret())}`}><TicketCheck/>電子チケット（QR）を見る</Link>}
        {ticketReady&&data.ticket!.status==="ACTIVE"&&<form action={resendMyTicketEmail}><input type="hidden" name="token" value={token}/><button className="line-unlink">チケットを登録メールアドレスへ再送する</button></form>}
        {receptionCode&&<div className="reception-code"><span>受付コード（QRが使えないときに受付で伝えてください）</span><strong>{formatReceptionCode(receptionCode)}</strong></div>}
        <LineLinkPanel token={token} participant={data.participant}/>
        {data.tickets.length>0&&<div className="line-link-panel">
          <p className="line-link-title"><Users size={16}/> チケット{data.order?`（${data.order.quantity}枚購入・${data.order.claimedCount}枚登録済み）`:""}</p>
          <ul className="ticket-list">{data.tickets.map(t=><li key={t.id}>
            <div className="ticket-list-head"><code>{t.ticketNumber}</code><span className="status-badge status-published">{t.checkedIn?"受付済み":t.holderName===null?"未配布":t.isMine?"自分が保有":"配布済み"}</span></div>
            <dl><dt>現在の保有者</dt><dd>{t.holderName===null?"未配布（受け取り待ち）":t.isMine?`${t.holderName}（あなた）`:`${t.holderName} さん`}</dd><dt>支払</dt><dd>{paymentLabel[t.paymentStatus]}</dd><dt>QR</dt><dd>{t.holderName===null?"受取人の登録後に発行":["ACTIVE","USED"].includes(t.status)?"発行済み":"入金確認後に有効"}</dd></dl>
            {t.history.length>0&&<ul className="ticket-history">{t.history.map((h,i)=><li key={i}>{h.at.toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric"})} {h.from} → {h.to}（{h.source==="DISTRIBUTION"?"配布":h.source==="HOLDER"?"本人による譲渡":"管理者による変更"}）</li>)}</ul>}
            {t.canShare&&(t.isMine||t.holderName===null)&&<ShareLinkPanel token={token} ticketId={t.id} ticketNumber={t.ticketNumber} label={t.holderName===null?"配布リンクを発行":"このチケットを譲渡する"}/>}
          </li>)}</ul>
          <p className="hint">リンクは7日間有効で、受け取りが確定すると使えなくなります。他の人に渡したチケットを購入者が勝手に再譲渡することはできません。</p>
        </div>}
      </aside>
      <section className="application-form-card">
        <div><p className="eyebrow">YOUR INFORMATION</p><h2>登録内容</h2><p>{locked?"現在の状態では変更できません。":"内容の修正やキャンセルができます。"}</p></div>
        {notice==="updated"&&<div className="success-banner">登録内容を更新しました。</div>}
        {notice==="cancelled"&&<div className="success-banner">参加予定をキャンセルしました。</div>}
        {notice==="line-unlinked"&&<div className="success-banner">LINE連携を解除しました。</div>}
        {notice==="email-sent"&&<div className="success-banner">登録メールアドレスへチケットを送信しました。</div>}
        {notice==="email-queued"&&<div className="success-banner">メールの送信を受け付けました。届かない場合は時間をおいてご確認ください。</div>}
        {notice==="email-limit"&&<div className="form-banner">再送は24時間に3回までです。しばらくしてからお試しください。</div>}
        {notice==="email-unavailable"&&<div className="form-banner">このチケットは再送できません（未入金・譲渡済み・取消済みなど）。</div>}
        {notice==="line-linked"&&<div className="success-banner">LINE連携が完了しました。</div>}
        {notice==="line-need-friend"&&<div className="form-banner">LINEアカウントの確認はできましたが、公式アカウントがまだ友だち追加されていません。下のボタンから友だち追加すると、通知を受け取れるようになります。</div>}
        {notice==="line-conflict"&&<div className="form-banner">このLINEアカウントまたはお申し込みは、すでに別の連携があるため連携できませんでした。</div>}
        {(notice==="line-login-failed"||notice==="line-login-unavailable")&&<div className="form-banner">LINEログインでの連携に失敗しました。連携コードをLINEトークに送信する方法をお試しください。</div>}
        {notice==="claimed"&&<div className="success-banner">チケットを受け取りました。</div>}
        <MyDetailsForm token={token} participant={data.participant} disabled={Boolean(locked)}/>
        {!locked&&<CancelRegistrationForm token={token} action={cancelMyRegistration}/>}
        <p className="secure-note"><ShieldCheck/>このURLはあなた専用です。第三者に共有しないでください。</p>
      </section>
    </section>
  </main>;
}
