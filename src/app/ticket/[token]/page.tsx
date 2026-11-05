import type {Metadata} from "next";
import Image from "next/image";
import QRCode from "qrcode";
import {notFound} from "next/navigation";
import {CalendarDays,CheckCircle2,Clock,MapPin,ScanLine,Info,ShieldCheck,Ticket as TicketIcon,TicketCheck,UserRound} from "lucide-react";
import {getTicketByToken} from "@/features/tickets/data";
import {qrTokenSecret} from "@/features/tickets/token";
import {ensureReceptionCode,formatReceptionCode} from "@/features/checkins/reception-code";
import {isLocalDemo} from "@/server/authz";
export const metadata:Metadata={title:"電子チケット",robots:{index:false,follow:false}};
export default async function TicketPage({params}:{params:Promise<{token:string}>}){const{token}=await params;const ticket=await getTicketByToken(token,qrTokenSecret());if(!ticket)notFound();const receptionCode=ticket.status==="ACTIVE"&&!isLocalDemo()?await ensureReceptionCode(ticket.id):null;const origin=process.env.NEXT_PUBLIC_APP_URL??"http://127.0.0.1:3000";const checkinUrl=`${origin}/checkin?token=${encodeURIComponent(token)}`;const qr=await QRCode.toDataURL(checkinUrl,{width:520,margin:2,errorCorrectionLevel:"M",color:{dark:"#0a0b0d",light:"#ffffff"}});return <main className="ticket-shell"><article className={`ticket-wrap${ticket.ticketBackgroundUrl?" has-bg":""}`} style={ticket.ticketBackgroundUrl?{backgroundImage:`url(${ticket.ticketBackgroundUrl})`}:undefined}>
  <header className="ticket-brand"><span>EVENT MANAGEMENT SYSTEM</span><span className="ticket-paid"><CheckCircle2/>入金済</span></header>
  <section className="ticket-title-block"><p className="eyebrow">EVENT TICKET</p><h1>{ticket.eventName}</h1></section>
  <div className="ticket-info-bar">
    <div><CalendarDays/><span>{ticket.eventDate.toLocaleDateString("ja-JP",{month:"long",day:"numeric",weekday:"short"})}</span></div>
    <div><Clock/><span>{ticket.startTime.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}<small>受付{ticket.receptionStartTime.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}</small></span></div>
    <div><MapPin/><span>{ticket.venueName}<small>{ticket.address}</small></span></div>
  </div>
  <section className="ticket-stub">
    <p className="stub-label"><ScanLine/>SCAN TO ENTER</p>
    <div className="ticket-qr-frame"><Image src={qr} alt="受付用QRコード" width={190} height={190} priority/></div>
    <div className={`ticket-status ticket-${ticket.status.toLowerCase()}`}><TicketCheck/>{ticket.status==="USED"?"受付済み":"参加予定"}</div>
    <p className="stub-hint">当日はこのQRコードを受付スタッフへご提示ください。</p>
    {receptionCode&&<div className="reception-code"><span>QRが読み取れないときの受付コード</span><strong>{formatReceptionCode(receptionCode)}</strong></div>}
    <div className="stub-fields">
      <div><span><UserRound/>参加者名</span><strong>{ticket.participantName} 様</strong></div>
      <div><span><TicketIcon/>チケット番号</span><strong>{ticket.ticketNumber}</strong></div>
    </div>
  </section>
  <details className="ticket-detail"><summary><Info/>イベント詳細を見る</summary><dl>
    <div><dt>日時</dt><dd>{ticket.eventDate.toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric",weekday:"short"})} {ticket.startTime.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}〜{ticket.endTime.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}（受付 {ticket.receptionStartTime.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}）</dd></div>
    <div><dt>会場</dt><dd>{ticket.venueName}<br/>{ticket.address}</dd></div>
    <div><dt>主催者</dt><dd>{ticket.organizer}</dd></div>
    <div><dt>イベント内容</dt><dd className="ticket-detail-text">{ticket.description}</dd></div>
    <div><dt>キャンセル規定</dt><dd className="ticket-detail-text">{ticket.cancellationPolicy}</dd></div>
    {ticket.promoUrl&&<div><dt>告知ページ</dt><dd><a href={ticket.promoUrl} target="_blank" rel="noreferrer">イベントページを開く</a></dd></div>}
  </dl></details>
  <footer><ShieldCheck/>QRコードに氏名・電話番号・メールアドレスは含まれていません</footer>
</article></main>}
