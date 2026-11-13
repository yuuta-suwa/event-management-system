import {describe,expect,it} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {attendanceStats,canReview,canTransition,canViewKind,collectionScope,lineReportText,ticketStats,type ReportRights,type Snapshot} from "@/features/reports/domain";
import {ReportBody} from "@/features/reports/report-body";
const none:ReportRights={manager:false,collector:false,approver:false,reporter:false,ledger:false};
describe("報告書の集計定義",()=>{
  it("T45/T46 購入者数は重複除外、枚数と購入者数を混同せず、取消・無料・未収・返金を区別する",()=>{
    const rows=[
      {status:"ACTIVE",paymentStatus:"PAID",amount:5000,buyerKey:"B"},{status:"ACTIVE",paymentStatus:"PAID",amount:5000,buyerKey:"B"},{status:"PROVISIONAL",paymentStatus:"UNPAID",amount:5000,buyerKey:"B"},
      {status:"ACTIVE",paymentStatus:"PAID",amount:5000,buyerKey:"D"},{status:"CANCELLED",paymentStatus:"REFUNDED",amount:5000,buyerKey:"E"},
    ];
    expect(ticketStats(5000,rows,5000)).toEqual({purchasers:2,sold:4,free:0,cancelled:1,valid:4,total:20000,confirmed:15000,receivable:5000,refunded:5000});
    expect(ticketStats(0,rows.slice(0,2).map(r=>({...r,amount:0})),0)).toMatchObject({sold:0,free:2,valid:2,total:0,confirmed:0});
  });
  it("T48 欠席はイベント終了後に確定し、開催中は未受付と区別する",()=>{
    const regs=[{checkedIn:true,walkIn:false},{checkedIn:true,walkIn:true},{checkedIn:false,walkIn:false},{checkedIn:false,walkIn:false}];
    expect(attendanceStats(regs,false)).toEqual({registered:4,attended:2,notCheckedIn:2,absent:0,pending:2,walkIn:1,rate:50});
    expect(attendanceStats(regs,true)).toMatchObject({absent:2,pending:0,notCheckedIn:2});
    expect(attendanceStats([],true)).toMatchObject({registered:0,rate:0});
  });
});
describe("報告書の権限",()=>{
  it("参加者報告は管理者・報告担当、集金報告は管理者・決裁権者・集金担当、統合は両方の権限が必要",()=>{
    expect(canViewKind("PARTICIPANT",{...none,manager:true})).toBe(true);expect(canViewKind("PARTICIPANT",{...none,reporter:true})).toBe(true);
    expect(canViewKind("PARTICIPANT",{...none,approver:true,collector:true})).toBe(false);
    expect(canViewKind("COLLECTION",{...none,collector:true})).toBe(true);expect(canViewKind("COLLECTION",{...none,approver:true})).toBe(true);expect(canViewKind("COLLECTION",{...none,reporter:true})).toBe(false);
    expect(canViewKind("INTEGRATED",{...none,approver:true})).toBe(false);expect(canViewKind("INTEGRATED",{...none,reporter:true,approver:true})).toBe(true);expect(canViewKind("INTEGRATED",{...none,manager:true})).toBe(true);
    for(const k of ["PARTICIPANT","COLLECTION","INTEGRATED"] as const)expect(canViewKind(k,none)).toBe(false);
  });
  it("集金担当者は自身の担当範囲だけ。承認は提出者本人以外の決裁権者(参加者報告は管理者)",()=>{
    expect(collectionScope({...none,collector:true})).toBe("OWN");expect(collectionScope({...none,approver:true})).toBe("ALL");expect(collectionScope({...none,manager:true,collector:true})).toBe("ALL");
    expect(canReview("COLLECTION",{...none,approver:true},"u2","u1")).toBe(true);expect(canReview("COLLECTION",{...none,approver:true},"u1","u1")).toBe(false);
    expect(canReview("COLLECTION",{...none,manager:true},"u2","u1")).toBe(false);expect(canReview("PARTICIPANT",{...none,manager:true},"u2","u1")).toBe(true);
  });
  it("状態遷移: 承認・差戻し後は動かせず、下書きから直接承認できない",()=>{
    expect(canTransition("DRAFT","SUBMITTED")).toBe(true);expect(canTransition("DRAFT","APPROVED")).toBe(false);expect(canTransition("SUBMITTED","APPROVED")).toBe(true);
    expect(canTransition("UNDER_REVIEW","RETURNED")).toBe(true);expect(canTransition("APPROVED","RETURNED")).toBe(false);expect(canTransition("RETURNED","SUBMITTED")).toBe(false);
  });
});
const snap:Snapshot={meta:{eventId:"e",eventName:"秋の交流会",eventDate:"2026-11-05T00:00:00+09:00",venueName:"丸の内ホール",startTime:"2026-11-05T18:00:00+09:00",endTime:"2026-11-05T20:30:00+09:00",generatedAt:"2026-11-05T21:00:00+09:00",reporterName:"報告 太郎",scope:"ALL"},
  tickets:{purchasers:3,sold:5,free:0,cancelled:1,valid:5,total:25000,confirmed:20000,receivable:5000,refunded:5000},
  feeAdvances:[{obligor:"山田 花子",advancer:"鈴木 一郎",amount:5000,tickets:"EV-001",advancedAt:"2026-11-01T10:00:00+09:00",recovered:2000,outstanding:3000,status:"OPEN"}],
  expenseAdvances:[{advancer:"佐藤",category:"会場費",payee:"丸の内ホール",amount:30000,paidAt:"2026-11-02T10:00:00+09:00",settled:10000,unsettled:20000,status:"PARTIALLY_SETTLED"}],
  participants:{registered:4,attended:3,notCheckedIn:1,absent:1,pending:0,walkIn:1,rate:75,roster:[{name:"山田 太郎",ticketNumber:"EV-001",checkedInAt:"2026-11-05T17:45:10+09:00",method:"QR",operator:"受付 花子",walkIn:false},{name:"当日 次郎",ticketNumber:"DAY-1",checkedInAt:"2026-11-05T18:10:00+09:00",method:"WALK_IN",operator:"受付 花子",walkIn:true}]}};
describe("T50 LINE報告文",()=>{
  it("氏名を含めない指定のときは集計のみで、氏名・受付時刻・立替の個別内容を含めない",()=>{
    const t=lineReportText(snap,{includeDetails:false});
    for(const needle of ["秋の交流会","購入者：3名","販売枚数：5枚","チケット売上：25,000円","入金確認済：20,000円","未収金：5,000円","立替金額：5,000円","回収済額：2,000円","未回収額：3,000円","参加予定者：4名","実参加者：3名","欠席者：1名","当日参加者：1名","受付率：75%","報告者：報告 太郎"])expect(t).toContain(needle);
    for(const secret of ["山田 太郎","当日 次郎","山田 花子","鈴木 一郎","17:45"])expect(t).not.toContain(secret);
    expect(t).toContain("認証付きリンク");
  });
  it("参加予定者数・実参加者数と、参加者名（実参加者は受付時刻つき・未受付者は別枠）を含む",()=>{
    const withAbsent={...snap,participants:{...snap.participants!,roster:[...snap.participants!.roster,{name:"未着 三郎",ticketNumber:"EV-9",checkedInAt:null,method:null,operator:null,walkIn:false}]}};
    const t=lineReportText(withAbsent,{includeDetails:true});
    for(const needle of ["参加予定者：4名","実参加者：3名","■ 実参加者（2名）","山田 太郎　17:45","当日 次郎　18:10","■ 欠席（1名）","未着 三郎"])expect(t).toContain(needle);
    expect(t).not.toContain("090");expect(t).not.toContain("@");
    expect(lineReportText({...withAbsent,participants:{...withAbsent.participants!,absent:0,pending:1}},{includeDetails:true})).toContain("■ 未受付（1名）");
  });
  it("共有リンクを付けられる",()=>{
    const t=lineReportText(snap,{includeDetails:true,link:"https://app.example.com/reports/s/abc"});
    expect(t).toContain("山田 太郎");expect(t).toContain("17:45");expect(t).toContain("QR読取");expect(t).toContain("https://app.example.com/reports/s/abc");
  });
  it("開催中は未受付を欠席にしない",()=>{expect(lineReportText({...snap,participants:{...snap.participants!,absent:0,pending:1,notCheckedIn:1}},{includeDetails:false})).toContain("未受付者：1名（開催中）")});
});
describe("T51 PDF/印刷用の本文",()=>{
  it("イベント概要・集金・立替・参加者・受付時刻をすべて含む",()=>{
    const html=renderToStaticMarkup(createElement(ReportBody,{s:snap}));
    for(const needle of ["イベント概要","チケット・集金","参加費立替","イベント経費立替","参加者","受付時刻","丸の内ホール","25,000","山田 太郎","17:45:10","QR読取","受付 花子","当日参加"])expect(html).toContain(needle);
  });
});
