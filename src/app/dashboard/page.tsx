import Link from "next/link";
import { CalendarDays, CalendarPlus, ChevronRight, CircleDollarSign, QrCode, TicketCheck, Users } from "lucide-react";
import { signOut } from "@/auth";
import { requireUser } from "@/server/authz";
import { listEvents } from "@/features/events/data";
const roleName={SUPER_ADMIN:"スーパー管理者",EVENT_MANAGER:"イベント管理者",RECEPTION_STAFF:"受付スタッフ",PARTICIPANT:"参加者"};
const statusLabel={DRAFT:"下書き",PUBLISHED:"受付中",CLOSED:"受付終了",CANCELLED:"中止",COMPLETED:"終了"};
export default async function DashboardPage(){
  const user=await requireUser();
  const events=await listEvents(user);
  const today=new Date();today.setHours(0,0,0,0);
  const upcoming=events.filter(e=>e.status==="PUBLISHED"&&e.eventDate>=today).sort((a,b)=>a.eventDate.getTime()-b.eventDate.getTime());
  const totalApplied=upcoming.reduce((n,e)=>n+e.registrationCount,0);
  const totalPaid=upcoming.reduce((n,e)=>n+e.paidCount,0);
  const totalRemaining=upcoming.reduce((n,e)=>n+Math.max(0,e.capacity-e.registrationCount),0);
  return <main className="app-shell">
  <header className="topbar"><div><p className="eyebrow">EVENT MANAGEMENT SYSTEM</p><h1>運営ダッシュボード</h1></div><form action={async()=>{"use server";await signOut({redirectTo:"/login"})}}><button className="ghost-button">ログアウト</button></form></header>
  <section className="welcome-card"><div><span className="status-dot"/>{roleName[user.role]}</div><h2>{user.name??"運営スタッフ"}さん、おはようございます</h2><p>次のイベントに向けた進捗を確認しましょう。</p></section>
  <section aria-labelledby="next-event"><div className="section-title"><div><p className="eyebrow">NEXT EVENT</p><h2 id="next-event">次回のイベント</h2></div><Link href="/events" className="text-button">イベント一覧 <ChevronRight size={16}/></Link></div>
  {upcoming.length===0?<div className="empty-state"><CalendarPlus/><h2>受付中のイベントはありません</h2><p>イベントを作成すると、ここに表示されます。</p></div>:
  <div className="event-list">{upcoming.map(event=>{const remaining=Math.max(0,event.capacity-event.registrationCount);const pct=event.capacity?Math.min(100,Math.round(event.registrationCount/event.capacity*100)):0;return <Link href={`/events/${event.id}`} className="event-card" key={event.id}><div className="date-tile"><strong>{event.eventDate.getDate()}</strong><span>{event.eventDate.toLocaleDateString("ja-JP",{month:"short"}).toUpperCase()}</span></div><div className="event-main"><span className="pill">{statusLabel[event.status]}</span><h3>{event.name}</h3><p><CalendarDays size={17}/> {event.eventDate.toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric",weekday:"short"})} {event.startTime.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}–{event.endTime.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}</p><p>{event.venueName}</p></div><div className="event-progress"><div><span>申込状況</span><strong>{event.registrationCount} / {event.capacity}名</strong></div><div className="progress"><i style={{width:`${pct}%`}}/></div><small>残り{remaining}席</small></div></Link>})}</div>}
  </section>
  <section className="metric-grid" aria-label="主要指標"><article><Users/><span>参加申込</span><strong>{totalApplied}</strong><small>受付中イベント {upcoming.length}件</small></article><article><CircleDollarSign/><span>入金済</span><strong>{totalPaid}</strong><small className="warning">未入金 {Math.max(0,totalApplied-totalPaid)}名</small></article><article><TicketCheck/><span>残席</span><strong>{totalRemaining}</strong><small>受付中イベント合計</small></article><article><QrCode/><span>当日の受付</span><strong>—</strong><small>受付ページで確認</small></article></section>
  <section className="quick-actions"><h2>クイック操作</h2><div><Link href="/checkin"><button type="button"><QrCode/>QR受付を開く</button></Link><Link href="/participants"><button type="button"><Users/>参加者名簿</button></Link><Link href="/payments"><button type="button"><CircleDollarSign/>入金を確認</button></Link></div></section></main>}
