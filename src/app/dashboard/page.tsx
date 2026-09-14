import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ChevronRight, CircleDollarSign, QrCode, TicketCheck, Users } from "lucide-react";
import { auth, signOut } from "@/auth";
const roleName={SUPER_ADMIN:"スーパー管理者",EVENT_MANAGER:"イベント管理者",RECEPTION_STAFF:"受付スタッフ",PARTICIPANT:"参加者"};
export default async function DashboardPage(){const session=await auth();if(!session)redirect("/login");return <main className="app-shell">
  <header className="topbar"><div><p className="eyebrow">EVENT MANAGEMENT SYSTEM</p><h1>運営ダッシュボード</h1></div><form action={async()=>{"use server";await signOut({redirectTo:"/login"})}}><button className="ghost-button">ログアウト</button></form></header>
  <section className="welcome-card"><div><span className="status-dot"/>{roleName[session.user.role]}</div><h2>{session.user.name??"運営スタッフ"}さん、おはようございます</h2><p>次のイベントに向けた進捗を確認しましょう。</p></section>
  <section aria-labelledby="next-event"><div className="section-title"><div><p className="eyebrow">NEXT EVENT</p><h2 id="next-event">次回のイベント</h2></div><Link href="/events" className="text-button">イベント一覧 <ChevronRight size={16}/></Link></div>
  <article className="event-card"><div className="date-tile"><strong>12</strong><span>SEP</span></div><div className="event-main"><span className="pill">受付中</span><h3>秋のビジネス交流会 2026</h3><p><CalendarDays size={17}/> 2026年9月12日（土） 18:00–20:30</p><p>丸の内コンファレンスホール</p></div><div className="event-progress"><div><span>申込状況</span><strong>24 / 30名</strong></div><div className="progress"><i style={{width:"80%"}}/></div><small>残り6席</small></div></article></section>
  <section className="metric-grid" aria-label="主要指標"><article><Users/><span>参加申込</span><strong>24</strong><small>定員 30名</small></article><article><CircleDollarSign/><span>入金済</span><strong>19</strong><small className="warning">未入金 5名</small></article><article><TicketCheck/><span>チケット確保</span><strong>27</strong><small>割当率 88.9%</small></article><article><QrCode/><span>当日の受付</span><strong>—</strong><small>9月12日 開始予定</small></article></section>
  <section className="quick-actions"><h2>クイック操作</h2><div><button><QrCode/>QR受付を開く</button><button><Users/>参加者名簿</button><button><CircleDollarSign/>入金を確認</button></div></section><p className="phase-note">PHASE 1 — 安全な認証・権限・データ基盤・PWAを実装済み</p></main>}
