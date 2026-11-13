// 報告書の集計・権限・状態遷移・LINE文面(純粋関数)。
export type ReportKind="COLLECTION"|"PARTICIPANT"|"INTEGRATED";
export type ReportStatus="DRAFT"|"SUBMITTED"|"UNDER_REVIEW"|"APPROVED"|"RETURNED";
export const kindLabel:Record<ReportKind,string>={COLLECTION:"集金状況報告",PARTICIPANT:"参加者報告",INTEGRATED:"統合イベント報告"};
export const statusLabel:Record<ReportStatus,string>={DRAFT:"下書き",SUBMITTED:"提出済み",UNDER_REVIEW:"確認中",APPROVED:"承認済み",RETURNED:"差戻し"};

/** 閲覧者がそのイベントで持つ権限(報告書の種類ごとの可否はここから決まる)。 */
export type ReportRights={manager:boolean;collector:boolean;approver:boolean;reporter:boolean;ledger:boolean};
export function canViewKind(kind:ReportKind,r:ReportRights){
  const participant=r.manager||r.reporter;
  const collectionFull=r.manager||r.approver;
  if(kind==="PARTICIPANT")return participant;
  if(kind==="COLLECTION")return collectionFull||r.collector;
  return participant&&collectionFull;// 統合報告: 含まれる情報すべての閲覧権限が必要
}
/** 集金担当者は自身の担当範囲だけ。管理者・決裁権者は全体。 */
export function collectionScope(r:ReportRights):"ALL"|"OWN"{return r.manager||r.approver?"ALL":"OWN"}
/** 作成(下書き)できる人: 閲覧できる人。 */
export const canCreate=canViewKind;
/** 確認(承認・差戻し)できる人: 集金/統合は決裁権者、参加者報告は管理者。いずれも提出者本人は不可。 */
export function canReview(kind:ReportKind,r:ReportRights,userId:string,submitterId:string){
  if(userId===submitterId)return false;
  return kind==="PARTICIPANT"?r.manager:r.approver;
}
const transitions:Record<ReportStatus,ReportStatus[]>={DRAFT:["SUBMITTED"],SUBMITTED:["UNDER_REVIEW","APPROVED","RETURNED"],UNDER_REVIEW:["APPROVED","RETURNED"],APPROVED:[],RETURNED:[]};
export const canTransition=(from:ReportStatus,to:ReportStatus)=>transitions[from].includes(to);

export type TicketRow={status:string;paymentStatus:string;amount:number;buyerKey:string};
export function ticketStats(price:number,tickets:TicketRow[],refunded:number){
  const cancelled=tickets.filter(t=>t.status==="CANCELLED"||t.status==="EXPIRED"||t.paymentStatus==="CANCELLED"||t.paymentStatus==="REFUNDED");
  const valid=tickets.filter(t=>!cancelled.includes(t));
  const free=price===0?valid.length:0;
  const sold=valid.length-free;
  const paid=valid.filter(t=>t.paymentStatus==="PAID");
  const confirmed=paid.reduce((n,t)=>n+t.amount,0);
  const total=price*sold;
  return {purchasers:new Set(valid.map(t=>t.buyerKey)).size,sold,free,cancelled:cancelled.length,valid:valid.length,total,confirmed,receivable:Math.max(0,total-confirmed),refunded};
}
export type RegRow={checkedIn:boolean;walkIn:boolean};
/** 欠席は「イベント終了後に受付していない人」。開催中は未受付と区別する。 */
export function attendanceStats(rows:RegRow[],eventEnded:boolean){
  const registered=rows.length;
  const attended=rows.filter(r=>r.checkedIn).length;
  const walkIn=rows.filter(r=>r.walkIn&&r.checkedIn).length;
  const notCheckedIn=registered-attended;
  return {registered,attended,notCheckedIn,absent:eventEnded?notCheckedIn:0,pending:eventEnded?0:notCheckedIn,walkIn,rate:registered?Math.round(attended/registered*1000)/10:0};
}
export const methodLabel:Record<string,string>={QR:"QR読取",RECEPTION_CODE:"受付コード",NAME_SEARCH:"参加者検索",WALK_IN:"当日参加",MANUAL:"手動"};

export type Snapshot={
  meta:{eventId:string;eventName:string;eventDate:string;venueName:string;startTime:string;endTime:string;generatedAt:string;reporterName:string;scope:"ALL"|"OWN"};
  tickets?:ReturnType<typeof ticketStats>;
  feeAdvances?:{obligor:string;advancer:string;amount:number;tickets:string;advancedAt:string;recovered:number;outstanding:number;status:string}[];
  expenseAdvances?:{advancer:string;category:string;payee:string;amount:number;paidAt:string;settled:number;unsettled:number;status:string}[];
  participants?:ReturnType<typeof attendanceStats>&{roster:{name:string;ticketNumber:string;checkedInAt:string|null;method:string|null;operator:string|null;walkIn:boolean}[]};
  ledger?:{custodyBalance:number;storePaid:number;storeUnpaid:number;expenses:number;balance:number};
};
const yen=(n:number)=>`${n.toLocaleString("ja-JP")}円`;
const jstDate=(iso:string)=>new Date(iso).toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo",month:"long",day:"numeric"});
const jstTime=(iso:string|null)=>iso?new Date(iso).toLocaleTimeString("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit"}):"—";
/** LINE共有用の報告文。氏名など個人情報と非公開帳簿は、含めるよう明示した場合のみ。通常は件数・金額の集計だけ。 */
export function lineReportText(s:Snapshot,opts:{includeDetails:boolean;link?:string}){
  const L:string[]=[`【${jstDate(s.meta.eventDate)} イベント報告】`,"",`イベント名：${s.meta.eventName}`,`開催日時：${new Date(s.meta.startTime).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}〜${jstTime(s.meta.endTime)}`,`開催場所：${s.meta.venueName}`];
  if(s.tickets){const t=s.tickets;L.push("","■ チケット",`購入者：${t.purchasers}名`,`販売枚数：${t.sold}枚（無料${t.free}枚／キャンセル${t.cancelled}枚／有効${t.valid}枚）`,`チケット売上：${yen(t.total)}`,`入金確認済：${yen(t.confirmed)}`,`未収金：${yen(t.receivable)}`,...(t.refunded?[`返金額：${yen(t.refunded)}`]:[]))}
  if(s.feeAdvances){const f=s.feeAdvances;const total=f.reduce((n,x)=>n+x.amount,0),rec=f.reduce((n,x)=>n+x.recovered,0);L.push("","■ 参加費立替",`件数：${f.length}件`,`立替金額：${yen(total)}`,`回収済額：${yen(rec)}`,`未回収額：${yen(total-rec)}`);if(opts.includeDetails)for(const x of f)L.push(`・${x.obligor}分（${x.advancer}が立替）${yen(x.amount)} 回収済${yen(x.recovered)}`)}
  if(s.expenseAdvances){const e=s.expenseAdvances;const total=e.reduce((n,x)=>n+x.amount,0),set=e.reduce((n,x)=>n+x.settled,0);L.push("","■ イベント経費立替",`件数：${e.length}件`,`立替金額：${yen(total)}`,`精算状況：精算済${yen(set)}／未精算${yen(total-set)}`);if(opts.includeDetails)for(const x of e)L.push(`・${x.advancer}：${x.category}（${x.payee}）${yen(x.amount)}`)}
  if(s.participants){const p=s.participants;L.push("","■ 参加者",`参加予定者：${p.registered}名`,`実参加者：${p.attended}名`,p.pending?`未受付者：${p.pending}名（開催中）`:`未受付者：${p.notCheckedIn}名`,...(p.absent?[`欠席者：${p.absent}名`]:[]),`当日参加者：${p.walkIn}名`,`受付率：${p.rate}%`);
    if(opts.includeDetails){
      const done=p.roster.filter(x=>x.checkedInAt),rest=p.roster.filter(x=>!x.checkedInAt);
      L.push("",`■ 実参加者（${done.length}名）`);
      for(const r of done)L.push(`${r.name}　${jstTime(r.checkedInAt)}　${methodLabel[r.method??""]??r.method??""}`);
      if(rest.length){L.push("",`■ ${p.absent?"欠席":"未受付"}（${rest.length}名）`);for(const r of rest)L.push(r.name)}
    }else L.push("","※ 参加者の氏名・受付時刻は、下記の認証付きリンクから確認してください。")}
  L.push("","■ 報告",`報告者：${s.meta.reporterName}`,`作成日時：${new Date(s.meta.generatedAt).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}`);
  if(opts.link)L.push("",`詳細（要ログイン・期限あり）：${opts.link}`);
  return L.join("\n");
}
