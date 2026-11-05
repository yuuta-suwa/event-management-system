import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
const state=vi.hoisted(()=>({user:{id:"",role:"SUPER_ADMIN",name:"x"}}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async(roles?:string[])=>{if(roles&&!roles.includes(state.user.role))throw new Error("FORBIDDEN");return state.user},validatedSessionUser:async()=>state.user}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
describe.skipIf(!enabled)("決裁権者の指定・変更と非公開帳簿（実DB・使い捨てテストDBのみ）",()=>{
  let db:typeof import("@/server/db").db;let act:typeof import("@/features/ledger/approver-actions");let acc:typeof import("@/features/ledger/access");let ledger:typeof import("@/features/ledger/data");let csvRoute:typeof import("@/app/api/ledger/csv/route");let sales:typeof import("@/features/sales/data");let expActions:typeof import("@/features/events/expense-actions");
  let eventId:string;let year:number;const u:Record<string,{id:string;role:string;name:string}>={};
  const as=(k:string)=>{state.user=u[k]};
  const form=(o:Record<string,string|number>)=>{const f=new FormData();for(const [k,v] of Object.entries(o))f.set(k,String(v));return f};
  async function call(fn:()=>Promise<unknown>){try{await fn();return "none"}catch(e){const m=e instanceof Error?e.message:"";if(m.startsWith("REDIRECT:")){const q=new URL(m.slice(9),"http://x").searchParams;return q.get("error")??q.get("notice")!}throw e}}
  const approvers=async()=>(await db.eventRoleAssignment.findMany({where:{eventId,role:"APPROVER",active:true}})).map(a=>a.userId).sort();
  const latest=()=>db.approverChangeRequest.findFirstOrThrow({where:{eventId},orderBy:{createdAt:"desc"}});
  const confirmLatest=async()=>{const id=(await latest()).id;return call(()=>act.confirmApproverChange(eventId,form({requestId:id})))};
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:"t".repeat(48)});
    ({db}=await import("@/server/db"));act=await import("@/features/ledger/approver-actions");acc=await import("@/features/ledger/access");ledger=await import("@/features/ledger/data");csvRoute=await import("@/app/api/ledger/csv/route");sales=await import("@/features/sales/data");expActions=await import("@/features/events/expense-actions");
    const run=randomUUID().slice(0,6);
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF")=>{const x=await db.user.create({data:{name:`${key}-${run}`,email:`${key}-${run}@example.com`,role}});u[key]={id:x.id,role,name:x.name}};
    await Promise.all([mk("admin","SUPER_ADMIN"),mk("admin2","SUPER_ADMIN"),mk("mgr","EVENT_MANAGER"),mk("ap1","RECEPTION_STAFF"),mk("ap2","RECEPTION_STAFF"),mk("x","RECEPTION_STAFF")]);
    const category=await db.eventCategory.create({data:{name:`G-${run}`,slug:`g-${randomUUID()}`}});
    const day=new Date(Date.now()+30*86400000);year=day.getFullYear();
    eventId=(await db.event.create({data:{categoryId:category.id,name:`帳簿テスト-${run}`,description:"テスト用イベントです。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity:50,price:10000,organizer:"主催",managerId:u.mgr.id,applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED"}})).id;
    for(let i=0;i<3;i++){
      const p=await db.participant.create({data:{name:`参加${i}`,nameKana:"サンカ",phone:`090${String(Math.floor(Math.random()*1e8)).padStart(8,"0")}`,email:`g${i}-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}});
      await db.ticket.create({data:{eventId,participantId:p.id,ticketNumber:`G-${run}-${i}`,qrTokenHash:randomUUID(),status:"ACTIVE",paymentStatus:i<2?"PAID":"UNPAID"}});
    }
    await db.eventExpense.create({data:{eventId,label:"会場費",amount:4000}});
  });
  afterAll(async()=>{await db?.$disconnect()});

  it("決裁権者が未設定の間は、誰も非公開帳簿を閲覧できない（SUPER_ADMINも不可）",async()=>{
    for(const k of ["admin","admin2","mgr","ap1","x"])expect(await acc.ledgerAccess(u[k].id,eventId)).toBe(false);
    await expect(acc.assertLedgerAccess(u.admin.id,eventId)).rejects.toThrow("FORBIDDEN");
  });
  it("T42 初回の指定: SUPER_ADMINが申請し、新決裁権者の本人承諾で確定する。権限のない人は申請できない",async()=>{
    as("x");expect(await call(()=>act.requestApproverChange(eventId,form({newApproverId:u.ap1.id,reason:"権限のない申請"})))).toBe("forbidden");
    as("mgr");expect(await call(()=>act.requestApproverChange(eventId,form({newApproverId:u.ap1.id,reason:"管理者でも不可"})))).toBe("forbidden");
    as("admin");expect(await call(()=>act.requestApproverChange(eventId,form({newApproverId:u.ap1.id,reason:"初回の指定"})))).toBe("requested");
    expect(await approvers()).toEqual([]);// 本人の承諾前は有効にならない
    as("admin2");expect(await confirmLatest()).toBe("forbidden");// 第三者は確認できない
    as("ap1");expect(await confirmLatest()).toBe("completed");
    expect(await approvers()).toEqual([u.ap1.id]);
    expect(await db.auditLog.count({where:{action:"APPROVER_CHANGED",entityId:(await latest()).id}})).toBe(1);
  });
  it("T40/T41 帳簿は指定された決裁権者だけが閲覧でき、SUPER_ADMIN・管理者・他のスタッフは画面データ・CSVとも拒否される",async()=>{
    expect(await acc.ledgerAccess(u.ap1.id,eventId)).toBe(true);
    for(const k of ["admin","admin2","mgr","x","ap2"]){expect(await acc.ledgerAccess(u[k].id,eventId)).toBe(false);as(k);const r=await csvRoute.GET(new Request(`http://localhost/api/ledger/csv?event=${eventId}`));expect(r.status).toBe(403)}
    as("ap1");const ok=await csvRoute.GET(new Request(`http://localhost/api/ledger/csv?event=${eventId}`));expect(ok.status).toBe(200);const text=await ok.text();expect(text).toContain("チケット売上");expect(text).toContain("会場費");
    expect((await csvRoute.GET(new Request("http://localhost/api/ledger/csv"))).status).toBe(403);
    const l=(await ledger.buildLedger(eventId))!;
    expect(l.tickets).toMatchObject({count:3,sales:20000,receivable:10000,paidCount:2});
    expect(l.expenses.total).toBe(4000);expect(l.balance).toBe(16000);
    expect(await db.auditLog.count({where:{action:"LEDGER_CSV_EXPORTED",actorId:u.ap1.id}})).toBe(1);
  });
  it("決裁権者が指定されたイベントの収支・経費は、決裁権者以外(SUPER_ADMIN含む)の売上画面・経費管理・CSVから見えない",async()=>{
    expect(await acc.financeVisible(u.admin.id,eventId)).toBe(false);expect(await acc.financeVisible(u.ap1.id,eventId)).toBe(true);
    const idsOf=async(viewer:string)=>(await sales.salesData(year,viewer)).events.map(e=>e.id);
    expect(await idsOf(u.admin.id)).not.toContain(eventId);expect(await idsOf(u.ap1.id)).toContain(eventId);
    as("admin");await expect(expActions.addExpense(eventId,form({label:"不正追加",amount:1}))).rejects.toThrow("FORBIDDEN");
    await expect(expActions.deleteExpense(eventId,form({expenseId:(await db.eventExpense.findFirstOrThrow({where:{eventId}})).id}))).rejects.toThrow("FORBIDDEN");
    expect(await db.eventExpense.count({where:{eventId,label:"不正追加"}})).toBe(0);
  });
  it("T42 通常の交代: 現決裁権者の承認と新決裁権者の承諾の両方がそろって初めて切り替わる。自己昇格は禁止",async()=>{
    as("admin");
    expect(await call(()=>act.requestApproverChange(eventId,form({newApproverId:u.admin.id,currentApproverId:u.ap1.id,reason:"自己昇格の試み"})))).toBe("self_promotion");
    expect(await call(()=>act.requestApproverChange(eventId,form({newApproverId:u.ap2.id,reason:"現決裁権者の指定なし"})))).toBe("needs_current");
    expect(await call(()=>act.requestApproverChange(eventId,form({newApproverId:u.ap1.id,currentApproverId:u.ap1.id,reason:"同じ人"})))).toBe("same");
    expect(await call(()=>act.requestApproverChange(eventId,form({newApproverId:u.ap2.id,currentApproverId:u.ap1.id,reason:"担当替え"})))).toBe("requested");
    expect(await call(()=>act.requestApproverChange(eventId,form({newApproverId:u.x.id,currentApproverId:u.ap1.id,reason:"二重申請"})))).toBe("already_pending");
    const id=(await latest()).id;
    as("ap2");expect(await call(()=>act.confirmApproverChange(eventId,form({requestId:id})))).toBe("confirmed");
    expect(await approvers()).toEqual([u.ap1.id]);// 現決裁権者の承認がまだ
    as("admin");expect(await call(()=>act.confirmApproverChange(eventId,form({requestId:id})))).toBe("forbidden");// SUPER_ADMINでも通常フローでは代理承認できない
    as("ap1");expect(await call(()=>act.confirmApproverChange(eventId,form({requestId:id})))).toBe("completed");
    expect(await approvers()).toEqual([u.ap2.id]);
    const old=await db.eventRoleAssignment.findFirstOrThrow({where:{eventId,userId:u.ap1.id,role:"APPROVER"}});expect(old.active).toBe(false);expect(old.revokedAt).not.toBeNull();
    expect(await acc.ledgerAccess(u.ap1.id,eventId)).toBe(false);expect(await acc.ledgerAccess(u.ap2.id,eventId)).toBe(true);
    as("ap1");expect((await csvRoute.GET(new Request(`http://localhost/api/ledger/csv?event=${eventId}`))).status).toBe(403);
  });
  it("旧決裁権者宛ての未完了の送金が残る間は交代できない（送金の照合後に交代できる）",async()=>{
    await db.collectionReceipt.create({data:{eventId,collectorId:u.x.id,amount:5000,method:"CASH",receivedAt:new Date()}});
    const rem=await db.remittance.create({data:{eventId,senderId:u.x.id,recipientId:u.ap2.id,amount:3000,method:"CASH",status:"SENT_REPORTED",sentAt:new Date()}});
    as("ap2");expect(await call(()=>act.requestApproverChange(eventId,form({newApproverId:u.ap1.id,currentApproverId:u.ap2.id,reason:"差し戻し"})))).toBe("requested");
    as("ap1");expect(await confirmLatest()).toBe("pending_remittances");
    expect(await approvers()).toEqual([u.ap2.id]);
    await db.remittance.update({where:{id:rem.id},data:{status:"RECEIVED",receivedAt:new Date(),receivedAmount:3000}});
    expect(await confirmLatest()).toBe("completed");
    expect(await approvers()).toEqual([u.ap1.id]);
  });
  it("緊急変更: 新決裁権者の承諾に加え、新決裁権者以外のSUPER_ADMIN2名の承認が必要。通常の担当者は緊急申請できない",async()=>{
    as("ap1");expect(await call(()=>act.requestApproverChange(eventId,form({newApproverId:u.ap2.id,currentApproverId:u.ap1.id,reason:"緊急にしたい",emergency:"on"})))).toBe("forbidden");
    as("admin");expect(await call(()=>act.requestApproverChange(eventId,form({newApproverId:u.ap2.id,currentApproverId:u.ap1.id,reason:"現決裁権者と連絡が取れない",emergency:"on"})))).toBe("requested");
    const id=(await latest()).id;
    as("ap2");expect(await call(()=>act.confirmApproverChange(eventId,form({requestId:id})))).toBe("confirmed");// 新決裁権者の承諾だけでは不足
    expect(await approvers()).toEqual([u.ap1.id]);
    as("admin");expect(await call(()=>act.confirmApproverChange(eventId,form({requestId:id})))).toBe("already_confirmed");// 申請者の二重承認は数えない
    as("ap1");expect(await call(()=>act.confirmApproverChange(eventId,form({requestId:id})))).toBe("confirmed");// 現決裁権者が確認しても緊急フローの承認には数えない
    expect(await approvers()).toEqual([u.ap1.id]);
    as("admin2");expect(await call(()=>act.confirmApproverChange(eventId,form({requestId:id})))).toBe("completed");
    expect(await approvers()).toEqual([u.ap2.id]);
    expect(await db.approverChangeApproval.count({where:{requestId:id}})).toBe(2);
    as("admin");expect(await call(()=>act.requestApproverChange(eventId,form({newApproverId:u.x.id,currentApproverId:u.ap2.id,reason:"取消の確認",emergency:"on"})))).toBe("requested");
    const r=await latest();as("admin");expect(await call(()=>act.cancelApproverChange(eventId,form({requestId:r.id})))).toBe("cancelled");
    as("mgr");expect(await call(()=>act.cancelApproverChange(eventId,form({requestId:r.id})))).toBe("forbidden");
    expect((await latest()).status).toBe("CANCELLED");
  });
});
