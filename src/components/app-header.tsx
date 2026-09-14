import Link from "next/link";
import {ArrowRightLeft,BadgeJapaneseYen,BarChart3,Bell,CalendarCheck2,CircleDollarSign,Download,LayoutDashboard,LogOut,Plus,QrCode,Users} from "lucide-react";
import {auth,signOut} from "@/auth";
type Active="dashboard"|"events"|"participants"|"staff"|"payments"|"checkin"|"transfers"|"notifications"|"analytics"|"sales"|"exports";
const cls=(active:Active,value:Active)=>active===value?"active":"";
export async function AppHeader({active}:{active:Active}){
  const user=(await auth())?.user;const manager=user?.role==="SUPER_ADMIN"||user?.role==="EVENT_MANAGER";const superAdmin=user?.role==="SUPER_ADMIN";
  return <header className="app-header"><Link href="/dashboard" className="app-brand"><CalendarCheck2/><span>EVENT<br/>MANAGEMENT</span></Link><nav aria-label="メインメニュー">
    <Link className={cls(active,"dashboard")} href="/dashboard"><LayoutDashboard/>ホーム</Link><Link className={cls(active,"events")} href="/events"><CalendarCheck2/>イベント</Link>
    {manager&&<><Link className={cls(active,"participants")} href="/participants"><Users/>参加者</Link><Link className={cls(active,"payments")} href="/payments"><CircleDollarSign/>入金</Link></>}
    <Link className={cls(active,"checkin")} href="/checkin"><QrCode/>受付</Link>
    {manager&&<><Link className={cls(active,"transfers")} href="/transfers"><ArrowRightLeft/>譲渡</Link><Link className={cls(active,"notifications")} href="/notifications"><Bell/>LINE</Link><Link className={cls(active,"analytics")} href="/analytics"><BarChart3/>分析</Link></>}
    {superAdmin&&<Link className={cls(active,"sales")} href="/sales"><BadgeJapaneseYen/>売上</Link>}<Link className={cls(active,"exports")} href="/exports"><Download/>CSV</Link>{manager&&<Link className={cls(active,"staff")} href="/staff"><Users/>スタッフ</Link>}
  </nav><div className="header-actions">{manager&&<Link href="/events/new" className="header-create"><Plus/>イベント作成</Link>}<form action={async()=>{"use server";await signOut({redirectTo:"/login"})}}><button aria-label="ログアウト"><LogOut/></button></form></div></header>
}
