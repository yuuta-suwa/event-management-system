import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {createHash,randomUUID} from "node:crypto";
const state=vi.hoisted(()=>({user:{id:"",role:"SUPER_ADMIN",name:"x"}}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async(roles?:string[])=>{if(roles&&!roles.includes(state.user.role))throw new Error("FORBIDDEN");return state.user},validatedSessionUser:async()=>state.user}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
describe.skipIf(!enabled)("イベント報告: 集計・権限・提出スナップショット・承認（実DB・使い捨てテストDBのみ）",()=>{
  let db:typeof import("@/server/db").db;let act:typeof import("@/features/reports/actions");let build:typeof import("@/features/reports/build");let dom:typeof import("@/features/reports/domain");let view:typeof import("@/features/reports/view");
  let eventId:string,event2:string;const u:Record<string,{id:string;role:string;name:string}>={};const run=randomUUID().slice(0,6);let seq=0;
  const as=(k:string)=>{state.user=u[k]};
  const form=(o:Record<string,string|number>)=>{const f=new FormData();for(const [k,v] of Object.entries(o))f.set(k,String(v));return f};
  async function call(fn:()=>Promise<unknown>){try{await fn();return {code:"none",path:""}}catch(e){const m=e instanceof Error?e.message:"";if(m.startsWith("REDIRECT:")){const x=new URL(m.slice(9),"http://x");return {code:x.searchParams.get("error")??x.searchParams.get("notice")!,path:x.pathname,query:x.searchParams}}throw e}}
  async function person(name:string,phone?:string){const n=++seq;return db.participant.create({data:{name,nameKana:name,phone:phone??`090-7777-${String(1000+n)}`,email:`r${n}-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}})}
  async function ticket(ev:string,holder:{id:string},o:{status?:"ACTIVE"|"USED"|"CANCELLED"|"PROVISIONAL";pay?:"PAID"|"UNPAID"|"REFUNDED";claimed?:boolean;orderId?:string;collectorId?:string;checkin?:{by:string;type:"QR"|"RECEPTION_CODE"|"WALK_IN";at?:Date};walkIn?:boolean;refund?:number}={}){
    const n=++seq;
    const t=await db.ticket.create({data:{eventId:ev,participantId:holder.id,ticketNumber:`R-${run}-${n}`,qrTokenHash:randomUUID(),status:o.status??"ACTIVE",paymentStatus:o.pay??"PAID",claimed:o.claimed??true,orderId:o.orderId,collectorId:o.collectorId}});
    if(o.claimed!==false)await db.eventRegistration.create({data:{eventId:ev,participantId:holder.id,ticketId:t.id,attendanceStatus:o.walkIn?"WALK_IN":"EXPECTED",applicationSource:o.walkIn?"WALK_IN":"WEB"}});
    if(o.pay==="REFUNDED")await db.payment.create({data:{ticketId:t.id,amount:o.refund??5000,paymentMethod:"BANK_TRANSFER",status:"REFUNDED"}});
    if(o.checkin)await db.checkin.create({data:{eventId:ev,ticketId:t.id,participantId:holder.id,checkedInBy:o.checkin.by,checkinType:o.checkin.type,checkedInAt:o.checkin.at??new Date()}});
    return t;
  }
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:"t".repeat(48),NEXT_PUBLIC_APP_URL:"https://app.example.com"});
    ({db}=await import("@/server/db"));act=await import("@/features/reports/actions");build=await import("@/features/reports/build");dom=await import("@/features/reports/domain");view=await import("@/features/reports/view");
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF")=>{const x=await db.user.create({data:{name:`${key}-${run}`,email:`${key}-${run}@example.com`,role}});u[key]={id:x.id,role,name:x.name}};
    await Promise.all([mk("admin","SUPER_ADMIN"),mk("mgr","EVENT_MANAGER"),mk("col","RECEPTION_STAFF"),mk("ap","RECEPTION_STAFF"),mk("rep","RECEPTION_STAFF"),mk("x","RECEPTION_STAFF"),mk("op","RECEPTION_STAFF")]);
    const category=await db.eventCategory.create({data:{name:`R-${run}`,slug:`r-${randomUUID()}`}});
    const day=new Date(Date.now()+3600_000);
    const mkEvent=async(name:string,managerId:string)=>(await db.event.create({data:{categoryId:category.id,name,description:"テスト用イベントです。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+2*3600_000),venueName:"報告会場",address:"住所",capacity:50,price:5000,organizer:"主催",managerId,applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED"}})).id;
    eventId=await mkEvent(`報告テスト-${run}`,u.mgr.id);event2=await mkEvent(`統合テスト-${run}`,u.mgr.id);
    for(const [k,role] of [["col","COLLECTOR"],["ap","APPROVER"],["rep","REPORTER"]] as const)await db.eventRoleAssignment.create({data:{eventId,userId:u[k].id,role,assignedBy:u.admin.id}});
    // 購入者B: 3枚(本人1/Cへ配布1/未配布1)、D: 単独、E: 取消・返金、W: 当日参加
    const B=await person("購入者B"),C=await person("受取人C"),D=await person("参加者D"),E=await person("取消E"),W=await person("当日W");
    const order=await db.ticketOrder.create({data:{eventId,buyerParticipantId:B.id,quantity:3,claimedCount:2}});
    await ticket(eventId,B,{orderId:order.id,checkin:{by:u.op.id,type:"QR"}});
    await ticket(eventId,C,{orderId:order.id,collectorId:u.col.id});
    await ticket(eventId,B,{orderId:order.id,claimed:false,pay:"UNPAID",status:"PROVISIONAL"});
    await ticket(eventId,D,{checkin:{by:u.op.id,type:"RECEPTION_CODE"}});
    await ticket(eventId,E,{status:"CANCELLED",pay:"REFUNDED"});
    await ticket(eventId,W,{status:"USED",walkIn:true,checkin:{by:u.op.id,type:"WALK_IN"}});
    await db.feeAdvance.create({data:{eventId,obligorName:"受取人C",advancerName:"購入者B",amount:5000,advancedAt:new Date(),method:"CASH",createdBy:u.col.id}});
    await db.expenseAdvance.create({data:{eventId,advancerName:"立替者P",category:"会場費",payee:"報告会場",amount:30000,paidAt:new Date(),status:"APPROVED",requestedBy:u.col.id}});
    // 統合報告用: mgr が決裁権者でもあるイベント
    await db.eventRoleAssignment.create({data:{eventId:event2,userId:u.mgr.id,role:"APPROVER"}});
    await db.eventExpense.create({data:{eventId:event2,label:"会場",amount:7000}});
  });
  afterAll(async()=>{await db?.$disconnect()});
  const rightsOf=async(k:string,ev=eventId)=>(await build.loadReportRights(u[k],ev))!.rights;

  it("T45-T49 集計: 購入者数(重複除外)・販売枚数・売上・未収・返金・立替・参加者・受付時刻",async()=>{
    const r=await rightsOf("admin");
    const s=(await build.buildSnapshot(eventId,"INTEGRATED",{reporterId:u.admin.id,reporterName:"報告者",rights:r,scope:"ALL"}))!;
    expect(s.tickets).toEqual({purchasers:3,sold:5,free:0,cancelled:1,valid:5,total:25000,confirmed:20000,receivable:5000,refunded:5000});
    expect(s.feeAdvances).toMatchObject([{obligor:"受取人C",advancer:"購入者B",amount:5000,recovered:0,outstanding:5000}]);
    expect(s.expenseAdvances).toMatchObject([{advancer:"立替者P",category:"会場費",amount:30000,unsettled:30000}]);
    expect(s.participants).toMatchObject({registered:4,attended:3,notCheckedIn:1,absent:0,pending:1,walkIn:1,rate:75});
    const roster=s.participants!.roster;expect(roster).toHaveLength(4);
    expect(roster.filter(x=>x.checkedInAt).map(x=>x.method).sort()).toEqual(["QR","RECEPTION_CODE","WALK_IN"]);
    expect(roster.filter(x=>x.checkedInAt).every(x=>x.operator===u.op.name)).toBe(true);
    // 終了後は未受付が欠席になる
    const later=(await build.buildSnapshot(eventId,"PARTICIPANT",{reporterId:u.admin.id,reporterName:"報告者",rights:r,scope:"ALL"},new Date(Date.now()+24*3600_000)))!;
    expect(later.participants).toMatchObject({absent:1,pending:0});expect(later.tickets).toBeUndefined();
  });
  it("T39 権限: 集金担当は担当範囲の集金報告だけ、決裁権者は集金報告、報告担当は参加者報告だけ。非公開帳簿は決裁権者のみ",async()=>{
    const can=async(k:string)=>{const r=await rightsOf(k);return (["PARTICIPANT","COLLECTION","INTEGRATED"] as const).filter(x=>dom.canViewKind(x,r))};
    expect(await can("admin")).toEqual(["PARTICIPANT","COLLECTION","INTEGRATED"]);expect(await can("mgr")).toEqual(["PARTICIPANT","COLLECTION","INTEGRATED"]);
    expect(await can("col")).toEqual(["COLLECTION"]);expect(await can("ap")).toEqual(["COLLECTION"]);expect(await can("rep")).toEqual(["PARTICIPANT"]);expect(await can("x")).toEqual([]);
    const rc=await rightsOf("col");expect(dom.collectionScope(rc)).toBe("OWN");
    const own=(await build.buildSnapshot(eventId,"COLLECTION",{reporterId:u.col.id,reporterName:"col",rights:rc,scope:"OWN"}))!;
    expect(own.tickets).toMatchObject({sold:1,total:5000,confirmed:5000});expect(own.participants).toBeUndefined();
    expect(own.feeAdvances).toHaveLength(1);expect(own.meta.scope).toBe("OWN");
    // 決裁権者でない SUPER_ADMIN には帳簿要約を含めない。決裁権者本人(管理者を兼ねる場合)には含める
    const adminInt=(await build.buildSnapshot(event2,"INTEGRATED",{reporterId:u.admin.id,reporterName:"a",rights:await rightsOf("admin",event2),scope:"ALL"}))!;
    expect(adminInt.ledger).toBeUndefined();
    const mgrInt=(await build.buildSnapshot(event2,"INTEGRATED",{reporterId:u.mgr.id,reporterName:"m",rights:await rightsOf("mgr",event2),scope:"ALL"}))!;
    expect(mgrInt.ledger).toMatchObject({expenses:7000});
  });
  it("T52/T53 下書き→提出→承認: 提出時点の集計を保存し、以後の変更で上書きしない。提出者本人は承認できない",async()=>{
    as("rep");
    const d1=await call(()=>act.saveReportDraft(form({eventId,kind:"PARTICIPANT"})));expect(d1.code).toBe("draft_saved");
    const id=d1.path.split("/")[2];
    expect((await call(()=>act.saveReportDraft(form({eventId,kind:"PARTICIPANT"})))).path).toBe(`/reports/${id}`);// 同じ下書きを更新(版は増えない)
    expect((await db.eventReport.findUniqueOrThrow({where:{id}})).version).toBe(1);
    as("x");expect((await call(()=>act.submitReport(form({reportId:id})))).code).toBe("forbidden");
    as("mgr");expect((await call(()=>act.approveReport(form({reportId:id})))).code).toBe("not_allowed");// 下書きは承認できない
    as("rep");
    expect((await call(()=>act.submitReport(form({reportId:id})))).code).toBe("submitted");
    const submitted=await db.eventReport.findUniqueOrThrow({where:{id}});expect(submitted.status).toBe("SUBMITTED");expect(submitted.submittedAt).not.toBeNull();
    const before=JSON.stringify(submitted.snapshot);
    // 提出後に受付が増えても、提出済みの内容は変わらない
    const late=await person("遅れてきたL");const lt=await ticket(eventId,late,{});void lt;
    expect(JSON.stringify((await db.eventReport.findUniqueOrThrow({where:{id}})).snapshot)).toBe(before);
    expect((await call(()=>act.submitReport(form({reportId:id})))).code).toBe("not_allowed");// 二重提出不可
    expect((await call(()=>act.approveReport(form({reportId:id})))).code).toBe("forbidden");// 提出者本人は承認不可
    as("x");expect((await call(()=>act.approveReport(form({reportId:id})))).code).toBe("forbidden");
    as("ap");expect((await call(()=>act.approveReport(form({reportId:id})))).code).toBe("forbidden");// 参加者報告の確認は管理者
    as("mgr");expect((await call(()=>act.startReportReview(form({reportId:id})))).code).toBe("under_review");
    expect((await call(()=>act.returnReport(form({reportId:id})))).code).toBe("note_required");
    expect((await call(()=>act.returnReport(form({reportId:id,note:"当日参加者の確認をお願いします"})))).code).toBe("returned");
    expect((await call(()=>act.approveReport(form({reportId:id})))).code).toBe("not_allowed");// 差戻し後は動かせない
    // 再提出: 差戻された版は残したまま新しい版(v2)を作る
    as("rep");const rev=await call(()=>act.reviseReport(form({reportId:id})));expect(rev.code).toBe("draft_saved");
    const v2=rev.path.split("/")[2];expect((await db.eventReport.findUniqueOrThrow({where:{id:v2}})).version).toBe(2);
    expect((await db.eventReport.findUniqueOrThrow({where:{id}})).status).toBe("RETURNED");
    expect((await call(()=>act.submitReport(form({reportId:v2})))).code).toBe("submitted");
    expect((JSON.parse(JSON.stringify((await db.eventReport.findUniqueOrThrow({where:{id:v2}})).snapshot)) as {participants:{registered:number}}).participants.registered).toBe(5);// v2は最新の集計
    expect((JSON.parse(before) as {participants:{registered:number}}).participants.registered).toBe(4);// v1は元のまま
    as("mgr");expect((await call(()=>act.approveReport(form({reportId:v2,note:"確認しました"})))).code).toBe("approved");
    expect(await db.eventReport.findUniqueOrThrow({where:{id:v2}})).toMatchObject({status:"APPROVED",reviewedBy:u.mgr.id,reviewNote:"確認しました"});
    for(const a of ["REPORT_SUBMITTED","REPORT_RETURNED","REPORT_APPROVED","REPORT_REVISED"])expect(await db.auditLog.count({where:{action:a,entityType:"EventReport"}})).toBeGreaterThan(0);
  });
  it("集金報告: 集金担当が提出し、決裁権者が承認する。SUPER_ADMIN(決裁権者でない)は承認できない。参加者報告は作れない",async()=>{
    as("col");expect((await call(()=>act.saveReportDraft(form({eventId,kind:"PARTICIPANT"})))).code).toBe("forbidden");
    expect((await call(()=>act.saveReportDraft(form({eventId,kind:"INTEGRATED"})))).code).toBe("forbidden");
    const d=await call(()=>act.saveReportDraft(form({eventId,kind:"COLLECTION"})));const id=d.path.split("/")[2];
    expect((await call(()=>act.submitReport(form({reportId:id})))).code).toBe("submitted");
    const snap=(await db.eventReport.findUniqueOrThrow({where:{id}})).snapshot as unknown as import("@/features/reports/domain").Snapshot;expect(snap.meta.scope).toBe("OWN");expect(snap.participants).toBeUndefined();
    as("admin");expect((await call(()=>act.approveReport(form({reportId:id})))).code).toBe("forbidden");
    as("mgr");expect((await call(()=>act.approveReport(form({reportId:id})))).code).toBe("forbidden");
    as("ap");expect((await call(()=>act.approveReport(form({reportId:id,note:"OK"})))).code).toBe("approved");
    // 閲覧権限: 集金報告は報告担当・無関係なスタッフには見えない
    expect(await view.authorizeReportView(u.rep,id)).toBeNull();expect(await view.authorizeReportView(u.x,id)).toBeNull();
    expect(await view.authorizeReportView(u.ap,id)).not.toBeNull();expect(await view.authorizeReportView(u.col,id)).not.toBeNull();
  });
  it("共有リンク: 下書きは共有不可、提出済みは期限つきで発行され、トークンの生値は保存しない。権限がなければ発行できない",async()=>{
    as("rep");const d=await call(()=>act.saveReportDraft(form({eventId,kind:"PARTICIPANT"})));const id=d.path.split("/")[2];
    expect((await call(()=>act.createReportShare(form({reportId:id,channel:"LINE",hours:24})))).code).toBe("not_submitted");
    await call(()=>act.submitReport(form({reportId:id})));
    const r=await call(()=>act.createReportShare(form({reportId:id,channel:"LINE",hours:24})));expect(r.code).toBe("shared");
    const token=r.query!.get("share")!;expect(token.length).toBeGreaterThan(20);
    const row=await db.reportShare.findFirstOrThrow({where:{reportId:id}});
    expect(row.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));expect(row.tokenHash).not.toContain(token);
    expect(row.channel).toBe("LINE");expect(row.expiresAt.getTime()-Date.now()).toBeGreaterThan(23*3600_000);expect(row.expiresAt.getTime()-Date.now()).toBeLessThanOrEqual(24*3600_000+1000);
    as("x");expect((await call(()=>act.createReportShare(form({reportId:id,channel:"LINE",hours:24})))).code).toBe("forbidden");// 閲覧権限なし → 発行されない
    expect(await db.reportShare.count({where:{reportId:id}})).toBe(1);
    expect(await db.auditLog.count({where:{action:"REPORT_SHARED",entityId:id}})).toBe(1);
  });
});
