import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
const state=vi.hoisted(()=>({user:{id:"",role:"SUPER_ADMIN",name:"x"}}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async(roles?:string[])=>{if(roles&&!roles.includes(state.user.role))throw new Error("FORBIDDEN");return state.user}}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
describe.skipIf(!enabled)("送金・受領照合・店舗支払（実DB・使い捨てテストDBのみ）",()=>{
  let db:typeof import("@/server/db").db;let rem:typeof import("@/features/collection/remittance-actions");let adv:typeof import("@/features/collection/advance-actions");let store:typeof import("@/features/collection/store-actions");let data:typeof import("@/features/collection/data");let custodyMod:typeof import("@/features/collection/custody");let sales:typeof import("@/features/sales/data");
  let eventId:string;const u:Record<string,{id:string;role:string;name:string}>={};
  const as=(k:string)=>{state.user=u[k]};
  const form=(o:Record<string,string|number>)=>{const f=new FormData();for(const [k,v] of Object.entries(o))f.set(k,String(v));return f};
  async function call(fn:()=>Promise<unknown>){try{await fn();return {code:"none"}}catch(e){const m=e instanceof Error?e.message:"";if(m.startsWith("REDIRECT:")){const q=new URL(m.slice(9),"http://x").searchParams;return {code:q.get("error")??q.get("notice")!}}throw e}}
  async function denied(fn:()=>Promise<unknown>){try{await fn();return false}catch(e){const m=e instanceof Error?e.message:"";return m==="FORBIDDEN"||/error=forbidden/.test(m)}}
  const today="2026-11-05";const ids:{r1?:string;r2?:string}={};
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:"t".repeat(48)});
    ({db}=await import("@/server/db"));rem=await import("@/features/collection/remittance-actions");adv=await import("@/features/collection/advance-actions");store=await import("@/features/collection/store-actions");data=await import("@/features/collection/data");custodyMod=await import("@/features/collection/custody");sales=await import("@/features/sales/data");
    const run=randomUUID().slice(0,6);
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF")=>{const x=await db.user.create({data:{name:`${key}-${run}`,email:`${key}-${run}@example.com`,role}});u[key]={id:x.id,role,name:x.name}};
    await Promise.all([mk("admin","SUPER_ADMIN"),mk("mgr","EVENT_MANAGER"),mk("c1","RECEPTION_STAFF"),mk("c2","RECEPTION_STAFF"),mk("ap","RECEPTION_STAFF"),mk("ap2","RECEPTION_STAFF"),mk("x","RECEPTION_STAFF")]);
    const category=await db.eventCategory.create({data:{name:`R-${run}`,slug:`r-${randomUUID()}`}});
    const day=new Date(Date.now()+20*86400000);
    eventId=(await db.event.create({data:{categoryId:category.id,name:"送金テスト",description:"テスト用イベントです。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity:50,price:10000,organizer:"主催",managerId:u.mgr.id,applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED"}})).id;
    for(const [k,role] of [["c1","COLLECTOR"],["c2","COLLECTOR"],["ap","APPROVER"],["ap2","APPROVER"]] as const)await db.eventRoleAssignment.create({data:{eventId,userId:u[k].id,role,assignedBy:u.admin.id}});
    for(const [k,amount] of [["c1",50000],["c2",20000]] as const)await db.collectionReceipt.create({data:{eventId,collectorId:u[k].id,amount,method:"CASH",receivedAt:new Date()}});
  });
  afterAll(async()=>{await db?.$disconnect()});
  const create=(k:string,o:Record<string,string|number>)=>{as(k);return call(()=>rem.createRemittance(eventId,form({method:"BANK_TRANSFER",...o})))};

  it("T24 集金担当が決裁権者への送金を作成できる（預り金を超える額・不適切な宛先は拒否）",async()=>{
    expect((await create("c1",{recipientId:u.ap.id,amount:30000,note:"第1回"})).code).toBe("remittance_created");
    ids.r1=(await db.remittance.findFirstOrThrow({where:{eventId,amount:30000}})).id;
    expect((await db.remittance.findUniqueOrThrow({where:{id:ids.r1}})).status).toBe("PLANNED");
    expect((await create("c1",{recipientId:u.ap.id,amount:60000})).code).toBe("exceeds_custody");
    expect((await create("c1",{recipientId:u.c2.id,amount:1000})).code).toBe("invalid_recipient");
    expect((await create("c1",{recipientId:u.c1.id,amount:1000})).code).toBe("self_remittance");
    as("mgr");expect(await denied(()=>rem.createRemittance(eventId,form({recipientId:u.ap.id,amount:1000,method:"CASH"})))).toBe(true);
    as("ap");expect(await denied(()=>rem.createRemittance(eventId,form({recipientId:u.admin.id,amount:1000,method:"CASH"})))).toBe(true);
  });
  it("送金済み報告で預り金から差し引かれ、残高を超える2件目は作れない",async()=>{
    as("c2");expect((await call(()=>rem.reportRemittanceSent(eventId,form({id:ids.r1!,sentAt:today,method:"BANK_TRANSFER"})))).code).toBe("forbidden");
    as("c1");expect((await call(()=>rem.reportRemittanceSent(eventId,form({id:ids.r1!,sentAt:today,method:"BANK_TRANSFER",evidenceNote:"振込控え"})))).code).toBe("remittance_reported");
    const c=await custodyMod.collectorCustody(db,eventId,u.c1.id);expect(c).toMatchObject({received:50000,committed:30000,unreconciled:30000,balance:20000,available:20000});
    expect((await create("c1",{recipientId:u.ap.id,amount:25000})).code).toBe("exceeds_custody");
    expect((await call(()=>rem.reportRemittanceSent(eventId,form({id:ids.r1!,sentAt:today,method:"CASH"})))).code).toBe("invalid_transition");
  });
  it("T28 送金は送金者と受取人以外には見えず、受領確認は宛先の決裁権者だけができる",async()=>{
    expect(await data.getRemittanceView(u.mgr,eventId)).toBeNull();expect(await data.getRemittanceView(u.x,eventId)).toBeNull();
    expect((await data.getRemittanceView(u.c2,eventId))!.remittances).toHaveLength(0);
    expect((await data.getRemittanceView(u.c1,eventId))!.remittances).toHaveLength(1);
    const apView=await data.getRemittanceView(u.ap,eventId);expect(apView!.remittances).toHaveLength(1);expect(apView!.totals.unreconciled).toBe(30000);
    expect(await data.getRemittanceView(u.admin,eventId)).toBeNull();expect((await data.getRemittanceView(u.ap2,eventId))!.remittances).toHaveLength(0);
    for(const k of ["c1","c2","mgr","admin","x","ap2"]){as(k);expect(await denied(()=>rem.confirmRemittanceReceived(eventId,form({id:ids.r1!,receivedAmount:30000})))).toBe(true)}
    expect((await db.remittance.findUniqueOrThrow({where:{id:ids.r1}})).status).toBe("SENT_REPORTED");
  });
  it("T25 受領額が違えば差異あり（理由必須）、送金側が訂正して双方一致で照合完了",async()=>{
    as("ap");expect((await call(()=>rem.confirmRemittanceReceived(eventId,form({id:ids.r1!,receivedAmount:28000})))).code).toBe("reason_required");
    expect((await call(()=>rem.confirmRemittanceReceived(eventId,form({id:ids.r1!,receivedAmount:28000,discrepancyNote:"手数料2,000円が差し引かれていた"})))).code).toBe("remittance_discrepancy");
    let r=await db.remittance.findUniqueOrThrow({where:{id:ids.r1}});expect(r).toMatchObject({status:"DISCREPANCY",receivedAmount:28000,amount:30000});
    as("c2");expect((await call(()=>rem.adjustRemittanceAmount(eventId,form({id:ids.r1!,amount:28000})))).code).toBe("forbidden");
    as("c1");expect((await call(()=>rem.adjustRemittanceAmount(eventId,form({id:ids.r1!,amount:29000})))).code).toBe("remittance_adjusted");
    expect((await db.remittance.findUniqueOrThrow({where:{id:ids.r1}})).status).toBe("DISCREPANCY");
    expect((await call(()=>rem.adjustRemittanceAmount(eventId,form({id:ids.r1!,amount:28000})))).code).toBe("remittance_adjusted");
    r=await db.remittance.findUniqueOrThrow({where:{id:ids.r1}});expect(r.status).toBe("RECEIVED");expect(r.senderConfirmedAt).not.toBeNull();expect(r.recipientConfirmedAt).not.toBeNull();expect(r.receivedAt).not.toBeNull();
    as("c1");expect((await call(()=>rem.cancelRemittance(eventId,form({id:ids.r1!,reason:"取り消したい"})))).code).toBe("invalid_transition");
    expect(await db.auditLog.count({where:{entityId:ids.r1,action:{startsWith:"REMITTANCE_"}}})).toBeGreaterThanOrEqual(4);
  });
  it("金額が一致する送金は受領確認で直接照合完了し、予定のままの受領や取消は適切に扱われる",async()=>{
    expect((await create("c1",{recipientId:u.ap.id,amount:10000})).code).toBe("remittance_created");
    const r=await db.remittance.findFirstOrThrow({where:{eventId,amount:10000}});
    as("ap");expect((await call(()=>rem.confirmRemittanceReceived(eventId,form({id:r.id,receivedAmount:10000})))).code).toBe("invalid_transition");
    as("c1");expect((await call(()=>rem.cancelRemittance(eventId,form({id:r.id,reason:""})))).code).toBe("reason_required");
    expect((await call(()=>rem.reportRemittanceSent(eventId,form({id:r.id,sentAt:today,method:"CASH"})))).code).toBe("remittance_reported");
    as("ap");expect((await call(()=>rem.confirmRemittanceReceived(eventId,form({id:r.id,receivedAmount:10000,receivedAt:today})))).code).toBe("remittance_received");
    expect((await db.remittance.findUniqueOrThrow({where:{id:r.id}})).status).toBe("RECEIVED");
    expect((await create("c2",{recipientId:u.ap.id,amount:5000})).code).toBe("remittance_created");
    const p=await db.remittance.findFirstOrThrow({where:{eventId,amount:5000}});
    as("c2");expect((await call(()=>rem.cancelRemittance(eventId,form({id:p.id,reason:"金額を誤ったため"})))).code).toBe("remittance_cancelled");
    expect((await custodyMod.collectorCustody(db,eventId,u.c2.id)).committed).toBe(0);
  });
  it("T26 内部送金は売上（入金・請求）にも経費にも影響しない",async()=>{
    const year=new Date().getFullYear()+0;
    const snap=async()=>({receipts:(await db.collectionReceipt.aggregate({where:{eventId},_sum:{amount:true}}))._sum.amount,payments:await db.payment.count(),expenses:await db.eventExpense.count({where:{eventId}}),revenue:(await sales.salesData(new Date(Date.now()+20*86400000).getFullYear())).revenue});
    const before=await snap();
    expect((await create("c2",{recipientId:u.ap.id,amount:7000})).code).toBe("remittance_created");
    const r=await db.remittance.findFirstOrThrow({where:{eventId,amount:7000}});
    as("c2");await call(()=>rem.reportRemittanceSent(eventId,form({id:r.id,sentAt:today,method:"CASH"})));as("ap");await call(()=>rem.confirmRemittanceReceived(eventId,form({id:r.id,receivedAmount:7000})));
    expect(await snap()).toEqual(before);expect(year).toBeGreaterThan(2000);
  });
  it("立替の精算を集金担当の預り金で相殺でき、預り金を超える相殺は拒否される",async()=>{
    as("c2");await call(()=>adv.requestExpenseAdvance(eventId,form({advancerName:"小澤",category:"備品",payee:"文具店",amount:15000,paidAt:today})));
    const e=await db.expenseAdvance.findFirstOrThrow({where:{eventId,category:"備品"}});
    as("ap");await call(()=>adv.decideExpenseAdvance(eventId,form({id:e.id,decision:"approve"})));
    const before=await custodyMod.collectorCustody(db,eventId,u.c1.id);expect(before.balance).toBe(12000);
    const settle=(amount:number,extra:Record<string,string>={})=>{as("ap");return call(()=>adv.recordExpenseSettlement(eventId,form({id:e.id,amount,settledAt:today,method:"CASH",...extra})))};
    expect((await settle(13000,{custodyCollectorId:u.c1.id})).code).toBe("exceeds_custody");
    expect((await settle(5000,{custodyCollectorId:u.x.id})).code).toBe("invalid_collector");
    expect((await settle(8000,{custodyCollectorId:u.c1.id})).code).toBe("settlement_saved");
    const after=await custodyMod.collectorCustody(db,eventId,u.c1.id);expect(after).toMatchObject({offsets:8000,balance:4000});
    expect((await db.expenseAdvance.findUniqueOrThrow({where:{id:e.id}})).status).toBe("PARTIALLY_SETTLED");
    expect(await db.eventExpense.count({where:{eventId,label:{contains:"備品"}}})).toBe(1);
  });
  it("T27 店舗支払は決裁権者だけが登録でき、一部・複数回の支払と未払残高を管理できる（経費は1回だけ計上）",async()=>{
    for(const k of ["c1","mgr","admin","x"]){as(k);expect(await denied(()=>store.createStorePayment(eventId,form({payee:"店舗",plannedAmount:1000})))).toBe(true)}
    expect(await data.getStorePaymentView(u.c1,eventId)).toBeNull();expect(await data.getStorePaymentView(u.mgr,eventId)).toBeNull();
    const expensesBefore=await db.eventExpense.count({where:{eventId}});
    as("ap");expect((await call(()=>store.createStorePayment(eventId,form({payee:"丸の内ホール",description:"会場費",plannedAmount:100000,plannedDate:"2026-11-20"})))).code).toBe("store_created");
    expect(await db.eventExpense.count({where:{eventId}})).toBe(expensesBefore+1);
    const sp=await db.storePayment.findFirstOrThrow({where:{eventId,payee:"丸の内ホール"},include:{expense:true}});expect(sp.expense.amount).toBe(100000);
    const pay=(amount:number)=>{as("ap");return call(()=>store.recordStorePayment(eventId,form({id:sp.id,amount,paidAt:today,method:"BANK_TRANSFER",evidenceNote:"振込控え",receiptNote:"領収書あり"})))};
    expect((await pay(40000)).code).toBe("store_paid");
    let v=await data.getStorePaymentView(u.ap,eventId);expect(v!.rows.find(r=>r.id===sp.id)).toMatchObject({paid:40000,unpaid:60000,status:"PARTIALLY_PAID"});
    expect((await pay(70000)).code).toBe("exceeds_balance");
    expect((await pay(60000)).code).toBe("store_paid");
    v=await data.getStorePaymentView(u.ap,eventId);expect(v!.rows.find(r=>r.id===sp.id)).toMatchObject({paid:100000,unpaid:0,status:"PAID"});
    expect(await db.eventExpense.count({where:{eventId}})).toBe(expensesBefore+1);
    const rec=await db.storePaymentRecord.findFirstOrThrow({where:{storePaymentId:sp.id,amount:60000}});
    as("ap");expect((await call(()=>store.voidStorePaymentRecord(eventId,form({recordId:rec.id,reason:"二重入力のため"})))).code).toBe("store_voided");
    v=await data.getStorePaymentView(u.ap,eventId);expect(v!.rows.find(r=>r.id===sp.id)).toMatchObject({paid:40000,unpaid:60000,status:"PARTIALLY_PAID"});
    expect((await call(()=>store.voidStorePaymentRecord(eventId,form({recordId:rec.id,reason:"二重入力のため"})))).code).toBe("already_voided");
  });
  it("既存の経費は店舗支払に紐づけられるが、立替由来の経費・紐づけ済みの経費は二重計上防止のため拒否される",async()=>{
    const own=await db.eventExpense.create({data:{eventId,label:"看板代",amount:30000}});
    const before=await db.eventExpense.count({where:{eventId}});
    as("ap");expect((await call(()=>store.createStorePayment(eventId,form({payee:"印刷店",expenseId:own.id})))).code).toBe("store_created");
    expect(await db.eventExpense.count({where:{eventId}})).toBe(before);
    expect((await db.storePayment.findUniqueOrThrow({where:{expenseId:own.id}})).plannedAmount).toBe(30000);
    expect((await call(()=>store.createStorePayment(eventId,form({payee:"印刷店2",expenseId:own.id})))).code).toBe("expense_unavailable");
    const fromAdvance=(await db.expenseAdvance.findFirstOrThrow({where:{eventId,category:"備品"}})).expenseId!;
    expect((await call(()=>store.createStorePayment(eventId,form({payee:"文具店",expenseId:fromAdvance})))).code).toBe("advance_expense");
    expect((await data.getStorePaymentView(u.ap,eventId))!.linkableExpenses.some(e=>e.id===fromAdvance||e.id===own.id)).toBe(false);
  });
});
