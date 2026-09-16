import {notFound} from "next/navigation";
import Link from "next/link";
import {CalendarDays,MapPin,ShieldCheck,TicketCheck,Wallet} from "lucide-react";
import {getMyRegistration} from "@/features/participants/my-registration";
import {issueTicketToken,qrTokenSecret} from "@/features/tickets/token";
import {MyDetailsForm,CancelRegistrationForm} from "@/features/participants/self-service-form";
import {cancelMyRegistration} from "@/features/participants/self-service-actions";
const attendanceLabel:Record<string,string>={APPLIED:"申込済",PAID:"入金済",EXPECTED:"参加予定",CHECKED_IN:"受付済",ABSENT:"欠席",CANCELLED:"キャンセル済み",WALK_IN:"当日参加"};
const attendanceBadgeClass:Record<string,string>={APPLIED:"status-published",PAID:"status-published",EXPECTED:"status-published",CHECKED_IN:"status-published",WALK_IN:"status-published",ABSENT:"status-cancelled",CANCELLED:"status-cancelled"};
export default async function MyRegistrationPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{notice?:string}>}){
  const [{token},{notice}]=await Promise.all([params,searchParams]);
  const data=await getMyRegistration(token);
  if(!data)notFound();
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
      </aside>
      <section className="application-form-card">
        <div><p className="eyebrow">YOUR INFORMATION</p><h2>登録内容</h2><p>{locked?"現在の状態では変更できません。":"内容の修正やキャンセルができます。"}</p></div>
        {notice==="updated"&&<div className="success-banner">登録内容を更新しました。</div>}
        {notice==="cancelled"&&<div className="success-banner">参加予定をキャンセルしました。</div>}
        <MyDetailsForm token={token} participant={data.participant} disabled={Boolean(locked)}/>
        {!locked&&<CancelRegistrationForm token={token} action={cancelMyRegistration}/>}
        <p className="secure-note"><ShieldCheck/>このURLはあなた専用です。第三者に共有しないでください。</p>
      </section>
    </section>
  </main>;
}
