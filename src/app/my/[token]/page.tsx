import {notFound} from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import {CalendarDays,CheckCircle2,MapPin,MessageCircle,QrCode,ShieldCheck,TicketCheck,Users,Wallet} from "lucide-react";
import {getMyRegistration} from "@/features/participants/my-registration";
import {issueTicketToken,qrTokenSecret} from "@/features/tickets/token";
import {MyDetailsForm,CancelRegistrationForm} from "@/features/participants/self-service-form";
import {cancelMyRegistration} from "@/features/participants/self-service-actions";
import {CopyApplyUrlButton} from "@/features/events/copy-apply-url-button";
const attendanceLabel:Record<string,string>={APPLIED:"申込済",PAID:"入金済",EXPECTED:"参加予定",CHECKED_IN:"受付済",ABSENT:"欠席",CANCELLED:"キャンセル済み",WALK_IN:"当日参加"};
const attendanceBadgeClass:Record<string,string>={APPLIED:"status-published",PAID:"status-published",EXPECTED:"status-published",CHECKED_IN:"status-published",WALK_IN:"status-published",ABSENT:"status-cancelled",CANCELLED:"status-cancelled"};
export default async function MyRegistrationPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{notice?:string}>}){
  const [{token},{notice}]=await Promise.all([params,searchParams]);
  const data=await getMyRegistration(token);
  if(!data)notFound();
  const origin=process.env.NEXT_PUBLIC_APP_URL??"http://127.0.0.1:3000";
  const claimLinks=data.order?await Promise.all(data.order.claimTokens.map(async t=>{const url=`${origin}/claim/${t}`;return {url,qr:await QRCode.toDataURL(url,{width:140,margin:1,color:{dark:"#17312f",light:"#ffffff"}})}})):[];
  const locked=data.attendanceStatus==="CANCELLED"||data.ticket?.checkedIn;
  const ticketReady=data.ticket&&["ACTIVE","USED"].includes(data.ticket.status);
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
        <div className="price-panel"><span>参加費</span><strong>¥{data.event.price.toLocaleString("ja-JP")}</strong></div>
        {data.ticket?.paymentStatus!=="PAID"&&data.attendanceStatus!=="CANCELLED"&&<div className="introducer"><Wallet size={16}/> 振込先：{data.event.bankInformation}</div>}
        {ticketReady&&<Link className="demo-ticket-link" href={`/ticket/${issueTicketToken(data.ticket!.id,data.ticket!.version,qrTokenSecret())}`}><TicketCheck/>電子チケット（QR）を見る</Link>}
        <div className="line-link-panel">
          {data.participant.lineConnected?
            <p className="line-link-done"><CheckCircle2 size={16}/> LINE連携済み。入金確認やチケットのご案内はLINEに届きます。</p>
          :<>
            <p className="line-link-title"><MessageCircle size={16}/> LINE連携（未連携）</p>
            <ol>
              <li>LINEで「イベント管理通知」を友だち追加</li>
              <li>トークでこの連携コードを送信：<code className="line-link-code">{data.participant.lineLinkCode}</code></li>
            </ol>
            {process.env.NEXT_PUBLIC_LINE_BASIC_ID&&<a className="demo-ticket-link" href={`https://line.me/R/ti/p/%40${process.env.NEXT_PUBLIC_LINE_BASIC_ID}`} target="_blank" rel="noreferrer"><MessageCircle size={16}/>友だち追加する</a>}
          </>}
        </div>
        {data.order&&data.order.quantity>1&&<div className="line-link-panel">
          <p className="line-link-title"><Users size={16}/> 複数枚購入（{data.order.claimedCount}/{data.order.quantity}枚 配布済み）</p>
          {claimLinks.length>0?<>
            <p>残り{claimLinks.length}枚を、招待したい方お一人ずつに別々のリンクでお送りください。</p>
            {claimLinks.map(l=><div className="referral-box" key={l.url}><Image src={l.qr} alt="チケット受け取りQR" width={96} height={96}/><div><span><QrCode size={16}/>受け取り用QR</span><code>{l.url}</code><CopyApplyUrlButton text={l.url}/></div></div>)}
          </>:<p>すべて配布済みです。</p>}
        </div>}
      </aside>
      <section className="application-form-card">
        <div><p className="eyebrow">YOUR INFORMATION</p><h2>登録内容</h2><p>{locked?"現在の状態では変更できません。":"内容の修正やキャンセルができます。"}</p></div>
        {notice==="updated"&&<div className="success-banner">登録内容を更新しました。</div>}
        {notice==="cancelled"&&<div className="success-banner">参加予定をキャンセルしました。</div>}
        {notice==="claimed"&&<div className="success-banner">チケットを受け取りました。</div>}
        <MyDetailsForm token={token} participant={data.participant} disabled={Boolean(locked)}/>
        {!locked&&<CancelRegistrationForm token={token} action={cancelMyRegistration}/>}
        <p className="secure-note"><ShieldCheck/>このURLはあなた専用です。第三者に共有しないでください。</p>
      </section>
    </section>
  </main>;
}
