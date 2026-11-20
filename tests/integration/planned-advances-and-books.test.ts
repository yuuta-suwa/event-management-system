import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
const state=vi.hoisted(()=>({user:{id:"",role:"SUPER_ADMIN",name:"x"} as {id:string;role:string;name:string}|null}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async(roles?:string[])=>{if(!state.user)throw new Error("UNAUTH");if(roles&&!roles.includes(state.user.role))throw new Error("FORBIDDEN");return state.user},validatedSessionUser:async()=>state.user}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
const secret="t".repeat(48);
describe.skipIf(!enabled)("立替予定・年次/月次の帳簿（実DB・使い捨てテストDBのみ）",()=>{
  let db:typeof import("@/server/db").db;let adv:typeof import("@/features/collection/advance-actions");let data:typeof import("@/features/collection/data");let ledger:typeof import("@/features/ledger/data");
  let books:typeof import("@/features/ledger/books");let csvRoute:typeof import("@/app/api/ledger/books/csv/route");let build:typeof import("@/features/reports/build");let tok:typeof import("@/features/tickets/token");
  let eventId:string,event2Id:string,event3Id:string;let Y=2037;const u:Record<string,{id:string;role:string;name:string}>={};const run=randomUUID().slice(0,6);
  const as=(k:string)=>{state.user=u[k]};
  const form=(o:Record<string,string>)=>{const f=new FormData();for(const [k,v] of Object.entries(o))f.set(k,v);return f};
  async function call(fn:()=>Promise<unknown>){try{await fn();return "none"}catch(e){const m=e instanceof Error?e.message:"";if(m.startsWith("REDIRECT:")){const q=new URL(m.slice(9),"http://x").searchParams;return q.get("error")??q.get("notice")!}if(m==="FORBIDDEN")return "forbidden";throw e}}
  const today="2026-11-19";
  const fee=(over:Record<string,string>={})=>({obligorName:"立替対象 太郎",advancerName:"立替 花子",amount:"3000",advancedAt:today,method:"CASH",...over});
  const exp=(over:Record<string,string>={})=>({advancerName:"立替 次郎",category:"備品代",payee:"文具店",amount:"4000",paidAt:today,...over});
  let seq=0;
  async function person(name:string){const n=++seq;return db.participant.create({data:{name,nameKana:`カナ${n}`,phone:`090-${run.replace(/\D/g,"").padEnd(4,"3").slice(0,4)}-${String(1000+n)}`,email:`b${n}-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}})}
  async function sell(ev:string,name:string,o:{paid?:boolean;checkedIn?:boolean;exited?:boolean;status?:"ACTIVE"|"CANCELLED";amount?:number}={}){
    const p=await person(name);const id=randomUUID();const paid=o.paid!==false;
    await db.ticket.create({data:{id,eventId:ev,participantId:p.id,ticketNumber:`B-${run}-${++seq}`,qrTokenHash:tok.hashTicketToken(tok.issueTicketToken(id,1,secret)),status:o.status??(paid?"ACTIVE":"PROVISIONAL"),paymentStatus:o.status==="CANCELLED"?"CANCELLED":paid?"PAID":"UNPAID"}});
    if(paid&&o.status!=="CANCELLED")await db.payment.create({data:{ticketId:id,amount:o.amount??10000,paymentMethod:"BANK_TRANSFER",status:"PAID",paidAt:new Date()}});
    await db.eventRegistration.create({data:{eventId:ev,participantId:p.id,ticketId:id,attendanceStatus:"PAID",applicationSource:"WEB"}});
    if(o.checkedIn){await db.checkin.create({data:{eventId:ev,ticketId:id,participantId:p.id,checkedInBy:u.admin.id,checkinType:"QR"}});if(o.exited)await db.checkout.create({data:{eventId:ev,ticketId:id,participantId:p.id,checkedOutBy:u.admin.id,checkoutType:"QR",reasonCode:"ILL",reasonNote:"頭痛"}})}
    return {id,p};
  }
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:secret});
    ({db}=await import("@/server/db"));adv=await import("@/features/collection/advance-actions");data=await import("@/features/collection/data");ledger=await import("@/features/ledger/data");books=await import("@/features/ledger/books");csvRoute=await import("@/app/api/ledger/books/csv/route");build=await import("@/features/reports/build");tok=await import("@/features/tickets/token");
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF")=>{const x=await db.user.create({data:{name:`${key}-${run}`,email:`${key}-${run}@example.com`,role}});u[key]={id:x.id,role,name:x.name}};
    await Promise.all([mk("admin","SUPER_ADMIN"),mk("mgr","EVENT_MANAGER"),mk("mgr2","EVENT_MANAGER"),mk("ap","RECEPTION_STAFF"),mk("staff","RECEPTION_STAFF")]);
    const category=await db.eventCategory.create({data:{name:`PB-${run}`,slug:`pb-${randomUUID()}`}});
    // 過去の実行・他のテストと重ならない「空いている年」を選び、その年の3月と7月に開催する
    for(let i=0;i<60;i++){const y=2040+Math.floor(Math.random()*60);if(!await db.event.count({where:{eventDate:{gte:new Date(`${y}-01-01T00:00:00+09:00`),lt:new Date(`${y+1}-01-01T00:00:00+09:00`)}}})){Y=y;break}}
    const base=(d:string)=>{const day=new Date(`${d}T18:00:00+09:00`);return {categoryId:category.id,description:"テスト用イベントです。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity:50,price:10000,organizer:"主催",applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED" as const}};
    eventId=(await db.event.create({data:{...base(`${Y}-03-10`),name:`帳簿A-${run}`,managerId:u.mgr.id}})).id;
    event2Id=(await db.event.create({data:{...base(`${Y}-03-25`),name:`帳簿B-${run}`,managerId:u.mgr2.id}})).id;
    event3Id=(await db.event.create({data:{...base(`${Y}-07-05`),name:`帳簿C-${run}`,managerId:u.mgr.id}})).id;
    await db.eventRoleAssignment.create({data:{eventId,userId:u.ap.id,role:"APPROVER",assignedBy:u.admin.id}});
    await db.eventRoleAssignment.create({data:{eventId,userId:u.mgr.id,role:"COLLECTOR"}}).catch(()=>{});
  });
  afterAll(async()=>{await db?.$disconnect()});

  it("参加費の立替予定: 予定のうちは立替額・未回収に入らず、回収もできない。実行済みにすると集計に入り、回収できる",async()=>{
    as("mgr");
    expect(await call(()=>adv.recordFeeAdvance(eventId,form({...fee(),planned:"on"})))).toBe("fee_planned");
    const p=await db.feeAdvance.findFirstOrThrow({where:{eventId},orderBy:{createdAt:"desc"}});expect(p.status).toBe("PLANNED");
    let l=(await ledger.buildLedger(eventId))!;expect(l.feeAdvances).toMatchObject({total:0,outstanding:0,planned:3000,plannedCount:1});
    expect(l.entries.some(e=>e.category==="参加費立替（予定）")).toBe(true);
    let v=(await data.getAdvancesView(u.mgr,eventId))!;expect(v.totals).toMatchObject({feeOutstanding:0,feePlanned:3000});
    expect(await call(()=>adv.recordFeeRecovery(eventId,form({feeAdvanceId:p.id,amount:"1000",recoveredAt:today,method:"CASH"})))).toBe("invalid_transition");
    // 実行済みにする
    as("staff");expect(await call(()=>adv.confirmFeeAdvance(eventId,form({feeAdvanceId:p.id,advancedAt:`${Y}-03-11`})))).toBe("forbidden");
    as("mgr2");expect(await call(()=>adv.confirmFeeAdvance(eventId,form({feeAdvanceId:p.id,advancedAt:`${Y}-03-11`})))).toBe("forbidden");
    as("mgr");expect(await call(()=>adv.confirmFeeAdvance(eventId,form({feeAdvanceId:p.id,advancedAt:`${Y}-03-11`})))).toBe("fee_confirmed");
    const c=await db.feeAdvance.findUniqueOrThrow({where:{id:p.id}});expect(c.status).toBe("OPEN");expect(c.advancedAt.toISOString()).toBe(`${Y}-03-10T15:00:00.000Z`);
    expect(await call(()=>adv.confirmFeeAdvance(eventId,form({feeAdvanceId:p.id,advancedAt:today})))).toBe("invalid_transition");// 二重に確定できない
    l=(await ledger.buildLedger(eventId))!;expect(l.feeAdvances).toMatchObject({total:3000,outstanding:3000,planned:0});
    expect(await call(()=>adv.recordFeeRecovery(eventId,form({feeAdvanceId:p.id,amount:"1000",recoveredAt:today,method:"CASH"})))).toBe("recovery_saved");
    v=(await data.getAdvancesView(u.mgr,eventId))!;expect(v.totals).toMatchObject({feeOutstanding:2000,feePlanned:0});
    expect(await db.auditLog.count({where:{action:{in:["FEE_ADVANCE_PLANNED","FEE_ADVANCE_CONFIRMED"]},entityId:p.id}})).toBe(2);
  });
  it("立替予定は取り消せる。取消済みは確定できない。予定は報告書の立替にも入らない",async()=>{
    as("mgr");
    await call(()=>adv.recordFeeAdvance(eventId,form({...fee({amount:"500"}),planned:"on"})));
    const p=await db.feeAdvance.findFirstOrThrow({where:{eventId,amount:500}});
    const snapBefore=(await build.buildSnapshot(eventId,"COLLECTION",{reporterId:u.mgr.id,reporterName:"m",rights:(await build.loadReportRights(u.mgr,eventId))!.rights,scope:"ALL"}))!;
    expect(snapBefore.feeAdvances!.some(f=>f.amount===500)).toBe(false);
    expect(await call(()=>adv.cancelFeeAdvance(eventId,form({feeAdvanceId:p.id})))).toBe("fee_cancelled");
    expect(await call(()=>adv.confirmFeeAdvance(eventId,form({feeAdvanceId:p.id,advancedAt:today})))).toBe("invalid_transition");
  });
  it("経費の立替予定: 決裁権者の承認・差戻しの対象にならず、実行済みにして申請すると通常の流れに入る",async()=>{
    as("mgr");
    expect(await call(()=>adv.requestExpenseAdvance(eventId,form({...exp(),planned:"on"})))).toBe("expense_planned");
    const p=await db.expenseAdvance.findFirstOrThrow({where:{eventId,status:"PLANNED"}});
    let l=(await ledger.buildLedger(eventId))!;expect(l.expenseAdvances).toMatchObject({total:0,planned:4000,plannedCount:1});
    as("ap");
    for(const decision of ["approve","review"])expect(await call(()=>adv.decideExpenseAdvance(eventId,form({id:p.id,decision})))).toBe("invalid_transition");
    expect(await call(()=>adv.decideExpenseAdvance(eventId,form({id:p.id,decision:"return",reason:"x"})))).toBe("invalid_transition");
    expect((await db.expenseAdvance.findUniqueOrThrow({where:{id:p.id}})).status).toBe("PLANNED");
    as("staff");expect(await call(()=>adv.confirmExpenseAdvance(eventId,form({id:p.id,paidAt:today})))).toBe("forbidden");
    as("mgr");expect(await call(()=>adv.confirmExpenseAdvance(eventId,form({id:p.id,paidAt:`${Y}-03-12`})))).toBe("expense_confirmed");
    expect(await db.expenseAdvance.findUniqueOrThrow({where:{id:p.id}})).toMatchObject({status:"REQUESTED"});
    as("ap");expect(await call(()=>adv.decideExpenseAdvance(eventId,form({id:p.id,decision:"approve"})))).toBe("expense_approved");
    l=(await ledger.buildLedger(eventId))!;expect(l.expenseAdvances).toMatchObject({total:4000,unsettled:4000,planned:0});
    expect(l.expenses.total).toBeGreaterThanOrEqual(4000);
    // 取消も可能
    as("mgr");await call(()=>adv.requestExpenseAdvance(eventId,form({...exp({amount:"700"}),planned:"on"})));
    const q=await db.expenseAdvance.findFirstOrThrow({where:{eventId,amount:700}});
    expect(await call(()=>adv.cancelExpenseAdvance(eventId,form({id:q.id})))).toBe("expense_cancelled");
  });

  it("年次の帳簿: 月別の販売枚数・売上・参加人数。取消・未入金・返金を正しく扱い、閲覧できないイベントは含まない",async()=>{
    await sell(eventId,`参加者あ-${run}`,{checkedIn:true});await sell(eventId,`参加者い-${run}`,{checkedIn:true,exited:true});await sell(eventId,`参加者う-${run}`,{paid:false});await sell(eventId,`取消者-${run}`,{status:"CANCELLED"});
    await sell(event2Id,`他イベント-${run}`,{checkedIn:true});
    await sell(event3Id,`七月参加-${run}`,{checkedIn:true,amount:8000});
    const adminBook=await books.loadBook({id:u.admin.id,role:"SUPER_ADMIN"},Y);
    const mine=adminBook.events.filter(e=>e.name.endsWith(run));expect(mine.map(e=>e.name).sort()).toEqual([`帳簿A-${run}`,`帳簿B-${run}`,`帳簿C-${run}`]);
    const a=mine.find(e=>e.id===eventId)!;expect(a.tickets).toMatchObject({sold:3,paid:2,sales:20000,billed:30000,receivable:10000});expect(a.attended).toBe(2);
    expect(adminBook.summary.months[2]).toMatchObject({events:2,sold:4,paid:3,attended:3});
    expect(adminBook.summary.months[6]).toMatchObject({events:1,sold:1,paid:1,sales:8000,attended:1});
    expect(adminBook.summary.totals).toMatchObject({events:3,sold:5,sales:38000,attended:4});
    expect(adminBook.attendees).toEqual([]);// 年次では参加者履歴は出さない
  });
  it("月次の帳簿: イベントごとの参加者名・受付・退出(理由)。電話番号・メールは含まない。権限の範囲だけ",async()=>{
    const m=await books.loadBook({id:u.admin.id,role:"SUPER_ADMIN"},Y,3);
    expect(m.events.map(e=>e.name).sort()).toEqual([`帳簿A-${run}`,`帳簿B-${run}`]);
    const att=m.attendees.filter(x=>x.eventId===eventId);
    expect(att.map(x=>x.name).sort()).toEqual([`参加者あ-${run}`,`参加者い-${run}`,`参加者う-${run}`].sort());// 取消者は出ない
    expect(att.find(x=>x.name.startsWith("参加者い"))).toMatchObject({checkedInAt:expect.any(Date),exitReason:"体調不良（頭痛）"});
    expect(att.find(x=>x.name.startsWith("参加者う"))).toMatchObject({paymentStatus:"UNPAID",checkedInAt:null,exitedAt:null});
    expect(JSON.stringify(m)).not.toMatch(/@example\.com|090-/);
    // イベント管理者: 自分が担当するイベントだけ(A・C)。別の管理者のB は見えない
    const mg=await books.loadBook({id:u.mgr.id,role:"EVENT_MANAGER"},Y);
    expect(mg.events.map(e=>e.name).sort()).toEqual([`帳簿A-${run}`,`帳簿C-${run}`]);
    const mg2=await books.loadBook({id:u.mgr2.id,role:"EVENT_MANAGER"},Y);expect(mg2.events.map(e=>e.name)).toEqual([`帳簿B-${run}`]);
    // 決裁権者(受付スタッフ権限)は、指定されたイベントだけ
    const ap=await books.loadBook({id:u.ap.id,role:"RECEPTION_STAFF"},Y);expect(ap.events.map(e=>e.name)).toEqual([`帳簿A-${run}`]);
    // 無関係なスタッフは何も見えない
    expect((await books.loadBook({id:u.staff.id,role:"RECEPTION_STAFF"},Y)).events).toEqual([]);
    // 月のずれ: 3月 に 7月のイベントは入らない
    expect(m.events.some(e=>e.id===event3Id)).toBe(false);
  });
  it("帳簿CSV: ログイン必須。管理者は年次・月次をダウンロードでき、権限のない人には空。参加者は氏名のみで監査ログに残る",async()=>{
    const get=(q:string)=>csvRoute.GET(new Request(`http://localhost/api/ledger/books/csv?${q}`));
    state.user=null;expect((await get(`year=${Y}`)).status).toBe(401);
    as("admin");const y=await get(`year=${Y}`);expect(y.status).toBe(200);const yt=await y.text();expect(yt).toContain(`${Y}年`);expect(yt).toContain(`帳簿A-${run}`);expect(yt).toContain("3月");expect(yt).not.toContain("参加者あ");
    const mm=await get(`year=${Y}&month=3`);const mt=await mm.text();expect(mt).toContain(`参加者あ-${run}`);expect(mt).toContain("体調不良（頭痛）");expect(mt).not.toMatch(/@example\.com|090-/);expect(mt).not.toContain("七月参加");
    as("staff");expect((await (await get(`year=${Y}&month=3`)).text())).not.toContain(`帳簿A-${run}`);
    expect(await db.auditLog.count({where:{action:"LEDGER_BOOK_CSV_EXPORTED",actorId:u.admin.id}})).toBe(2);
  });
});
