import Link from "next/link";
import {notFound} from "next/navigation";
import {AppHeader} from "@/components/app-header";
import {requireUser} from "@/server/authz";
import {authorizeReportView} from "@/features/reports/view";
import {kindLabel,lineReportText,statusLabel,canTransition,type Snapshot} from "@/features/reports/domain";
import {approveReport,createReportShare,returnReport,reviseReport,startReportReview,submitReport} from "@/features/reports/actions";
import {ReportBody} from "@/features/reports/report-body";
import {CopyButton} from "@/features/reports/copy-button";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;
const notices:Record<string,string>={draft_saved:"下書きを保存しました。",submitted:"提出しました。提出時点の集計結果を保存しました。",under_review:"確認中にしました。",approved:"承認しました。",returned:"差戻しました。",shared:"閲覧リンクを発行しました。"};
const errors:Record<string,string>={forbidden:"この操作を行う権限がありません（提出者本人は承認できません）。",not_allowed:"現在の状態ではこの操作はできません。",note_required:"差戻しにはコメントが必要です。",not_found:"対象が見つかりません。",not_submitted:"下書きは共有できません。先に提出してください。",conflict:"他の操作と競合しました。"};
const jst=(d:Date|null)=>d?d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
export default async function ReportPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{notice?:string;error?:string;share?:string;details?:string}>}){
  const user=await requireUser(STAFF);
  const [{id},q]=await Promise.all([params,searchParams]);
  const view=await authorizeReportView(user,id);
  if(!view)notFound();
  const {report,mayReview,isCreator}=view;
  const origin=process.env.NEXT_PUBLIC_APP_URL??"";
  const link=q.share?`${origin}/reports/s/${q.share}`:undefined;
  const details=q.details!=="0";// 既定は氏名つき(コピーして送る本人の判断。氏名のみで電話番号・メールは含まない)
  const text=lineReportText(report.snapshot as Snapshot,{includeDetails:details,link});
  const st=report.status;
  return <><AppHeader active="reports"/><main className="content-shell">
    <div className="page-heading"><div><p className="eyebrow">REPORT v{report.version}</p><h1>{kindLabel[report.kind]}</h1><p>{view.event.name}　／　状態：<strong>{statusLabel[st]}</strong>　作成：{view.creatorName}（{jst(report.createdAt)}）{report.submittedAt&&`　提出：${jst(report.submittedAt)}`}</p></div></div>
    {q.notice&&<div className="success-banner">{notices[q.notice]??"完了しました。"}</div>}
    {q.error&&<div className="form-banner" role="alert">{errors[q.error]??"処理に失敗しました。"}</div>}
    {report.reviewedAt&&<div className={st==="RETURNED"?"form-banner":"success-banner"}>{statusLabel[st]}：{view.reviewerName}（{jst(report.reviewedAt)}）{report.reviewNote&&`　コメント：${report.reviewNote}`}</div>}
    <p className="collection-links"><Link href={`/reports?event=${report.eventId}`}>← 報告一覧</Link>{st!=="DRAFT"&&<Link href={`/reports/${report.id}/print`} target="_blank">PDF・印刷用ページ</Link>}</p>
    <section className="collection-section"><h2>操作</h2><div className="inline-form">
      {isCreator&&canTransition(st,"SUBMITTED")&&<form action={submitReport}><input type="hidden" name="reportId" value={report.id}/><button>この内容で提出する</button></form>}
      {isCreator&&st==="RETURNED"&&<form action={reviseReport}><input type="hidden" name="reportId" value={report.id}/><button>修正して再提出する（新しい版を作成）</button></form>}
      {mayReview&&st==="SUBMITTED"&&<form action={startReportReview}><input type="hidden" name="reportId" value={report.id}/><button>確認を開始</button></form>}
      {mayReview&&(st==="SUBMITTED"||st==="UNDER_REVIEW")&&<form action={approveReport} className="inline-form"><input type="hidden" name="reportId" value={report.id}/><input name="note" placeholder="コメント（任意）" maxLength={500}/><button>承認する</button></form>}
      {mayReview&&(st==="SUBMITTED"||st==="UNDER_REVIEW")&&<form action={returnReport} className="inline-form"><input type="hidden" name="reportId" value={report.id}/><input name="note" placeholder="差戻し理由（必須）" required maxLength={500}/><button className="line-unlink">差戻す</button></form>}
    </div>
    {st==="DRAFT"&&<p className="hint">下書きです。提出するまで何度でも最新の集計に更新できます。提出すると、その時点の集計結果が保存され、以後は上書きされません。</p>}</section>
    <ReportBody s={report.snapshot as Snapshot}/>
    {st!=="DRAFT"&&<section className="collection-section"><h2>LINEで共有</h2>
      <p className="hint">氏名・受付時刻などの個人情報や非公開帳簿は、LINEグループへ直接送らず、期限付きの認証付きリンクで共有します（リンク先でもログインと閲覧権限を確認します）。</p>
      <form action={createReportShare} className="inline-form"><input type="hidden" name="reportId" value={report.id}/><input type="hidden" name="channel" value="LINE"/><select name="hours" defaultValue="72"><option value="24">24時間</option><option value="72">3日間</option><option value="168">7日間</option></select><button>閲覧リンクを発行</button></form>
      <textarea readOnly rows={14} value={text} className="report-text" aria-label="LINE用報告文"/>
      <div className="inline-form"><CopyButton text={text}/>{link&&<a className="demo-ticket-link" target="_blank" rel="noreferrer" href={`https://line.me/R/msg/text/?${encodeURIComponent(text)}`}>LINEで送る（送信先はLINEで選択）</a>}<Link href={`/reports/${report.id}?details=${details?"0":"1"}${q.share?`&share=${q.share}`:""}`}>{details?"氏名を含めない文面にする（集計のみ）":"氏名・受付時刻を含める（取扱注意）"}</Link></div></section>}
  </main></>;
}
