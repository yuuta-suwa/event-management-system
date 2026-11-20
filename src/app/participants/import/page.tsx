import Link from "next/link";
import {AppHeader} from "@/components/app-header";
import {requireUser} from "@/server/authz";
import {db} from "@/server/db";
import {formatJstDate} from "@/lib/jst";
import {RosterImporter} from "@/features/roster/import-form";
export default async function RosterImportPage({searchParams}:{searchParams:Promise<{event?:string;created?:string}>}){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const q=await searchParams;
  // システム管理者は全イベント、イベント管理者は自分が担当のイベントだけ。
  const events=await db.event.findMany({where:user.role==="SUPER_ADMIN"?{}:{managerId:user.id},orderBy:{eventDate:"desc"},take:300,select:{id:true,name:true,eventDate:true,price:true}});
  return <><AppHeader active="participants"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">PAST RECORDS</p><h1>過去の記録を入力</h1><p>これまでの参加者・入金・出欠を名簿に入力します。メールやLINEの通知は送りません。入力した内容は、年次・月次の帳簿と売上にも反映されます。</p></div><Link className="secondary-link" href="/participants">← 参加者名簿に戻る</Link></div>
    {q.created==="1"&&<div className="success-banner">イベントを追加しました。続けて、下から参加者（人数・名簿・入金）を入力してください。</div>}
    <RosterImporter initialEventId={q.event} events={events.map(e=>({id:e.id,price:e.price,label:`${formatJstDate(e.eventDate)}　${e.name}`}))}/>
  </main></>;
}
