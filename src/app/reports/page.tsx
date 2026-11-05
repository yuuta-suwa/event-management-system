import Link from "next/link";
import {FileText} from "lucide-react";
import {AppHeader} from "@/components/app-header";
import {requireUser} from "@/server/authz";
import {db} from "@/server/db";
import {loadReportRights} from "@/features/reports/build";
import {canCreate,canViewKind,kindLabel,statusLabel,type ReportKind} from "@/features/reports/domain";
import {saveReportDraft} from "@/features/reports/actions";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;
const notices:Record<string,string>={demo:"ローカルデモでは保存されません。"};
const errors:Record<string,string>={forbidden:"この報告書を作成する権限がありません。",not_found:"イベントが見つかりません。",conflict:"他の操作と競合しました。もう一度お試しください。"};
const jst=(d:Date)=>d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
export default async function ReportsPage({searchParams}:{searchParams:Promise<{event?:string;notice?:string;error?:string}>}){
  const user=await requireUser(STAFF);
  const q=await searchParams;
  const events=await db.event.findMany({where:user.role==="SUPER_ADMIN"?{}:{OR:[{managerId:user.id},{roleAssignments:{some:{userId:user.id,active:true}}}]},orderBy:{eventDate:"desc"},select:{id:true,name:true},take:100});
  const eventId=events.find(e=>e.id===q.event)?.id??events[0]?.id;
  const ctx=eventId?await loadReportRights(user,eventId):null;
  const kinds=(["COLLECTION","PARTICIPANT","INTEGRATED"] as ReportKind[]).filter(k=>ctx&&canViewKind(k,ctx.rights));
  const reports=ctx&&kinds.length?await db.eventReport.findMany({where:{eventId,kind:{in:kinds}},orderBy:[{kind:"asc"},{version:"desc"}],select:{id:true,kind:true,version:true,status:true,createdAt:true,submittedAt:true}}):[];
  return <><AppHeader active="reports"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">EVENT REPORTS</p><h1>イベント報告</h1><p>売上・立替・参加者・受付時刻を自動集計し、提出・承認・LINE共有・PDF出力まで行います。</p></div>
      <form className="year-picker"><select name="event" defaultValue={eventId} aria-label="イベント">{events.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><button>表示</button></form></div>
    {q.notice&&<div className="success-banner">{notices[q.notice]??"完了しました。"}</div>}
    {q.error&&<div className="form-banner" role="alert">{errors[q.error]??"処理に失敗しました。"}</div>}
    {!ctx||kinds.length===0?<div className="empty-state"><FileText/><h2>閲覧できる報告書がありません</h2><p>報告書は、イベントの管理者・集金担当・決裁権者・報告担当に指定された方が利用できます。</p></div>:
      kinds.map(kind=><section className="collection-section" key={kind}><h2>{kindLabel[kind]}</h2>
        {canCreate(kind,ctx.rights)&&<form action={saveReportDraft} className="inline-form"><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="kind" value={kind}/><button>最新の集計で下書きを作成・更新</button></form>}
        <table className="data-table"><thead><tr><th>版</th><th>状態</th><th>作成</th><th>提出</th><th></th></tr></thead><tbody>
          {reports.filter(r=>r.kind===kind).map(r=><tr key={r.id}><td>v{r.version}</td><td>{statusLabel[r.status]}</td><td>{jst(r.createdAt)}</td><td>{r.submittedAt?jst(r.submittedAt):"—"}</td><td><Link href={`/reports/${r.id}`}>開く</Link></td></tr>)}
        </tbody></table>
        {reports.filter(r=>r.kind===kind).length===0&&<p className="hint">まだ報告書はありません。</p>}
      </section>)}
  </main></>;
}
