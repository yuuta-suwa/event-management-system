import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
const state=vi.hoisted(()=>({user:{id:"",role:"SUPER_ADMIN",name:"x"}}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async(roles?:string[])=>{if(roles&&!roles.includes(state.user.role))throw new Error("FORBIDDEN");return state.user}}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
const secret="t".repeat(48);
type A=typeof import("@/features/collection/actions");type B=typeof import("@/features/collection/advance-actions");type D=typeof import("@/features/collection/data");
describe.skipIf(!enabled)("集金・立替（実DB・使い捨てテストDBのみ）",()=>{
  let db:typeof import("@/server/db").db;let act:A;let adv:B;let data:D;
  let eventId:string,event2Id:string;const u:Record<string,{id:string;role:string;name:string}>={};
  let orderId:string,solo:string;const orderTickets:string[]=[];
  const as=(k:string)=>{state.user=u[k]};
  const form=(o:Record<string,string>)=>{const f=new FormData();for(const [k,v] of Object.entries(o))f.set(k,v);return f};
  async function call(fn:()=>Promise<unknown>){try{await fn();return {code:"none",kind:"none"}}catch(e){const m=e instanceof Error?e.message:"";if(m.startsWith("REDIRECT:")){const q=new URL(m.slice(9),"http://x").searchParams;const kind=q.get("error")?"error":"notice";return {code:q.get(kind)!,kind}}throw e}}
  async function denied(fn:()=>Promise<unknown>){try{await fn();return false}catch(e){const m=e instanceof Error?e.message:"";return m==="FORBIDDEN"||/error=forbidden/.test(m)}}
  const today="2026-11-04";
  const receipt=(k:string,target:string,amount:number,extra:Record<string,string>={})=>{as(k);return call(()=>act.recordReceipt(eventId,form({target,amount:String(amount),method:"CASH",receivedAt:today,payerName:"支払者",...extra})))};
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:secret,NEXT_PUBLIC_APP_URL:"https://app.example.com"});
    ({db}=await import("@/server/db"));act=await import("@/features/collection/actions");adv=await import("@/features/collection/advance-actions");data=await import("@/features/collection/data");
    const tok=await import("@/features/tickets/token");const run=randomUUID().slice(0,6);
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF")=>{const x=await db.user.create({data:{name:`${key}-${run}`,email:`${key}-${run}@example.com`,role}});u[key]={id:x.id,role,name:x.name}};
    await Promise.all([mk("admin","SUPER_ADMIN"),mk("mgr","EVENT_MANAGER"),mk("mgr2","EVENT_MANAGER"),mk("c1","RECEPTION_STAFF"),mk("c2","RECEPTION_STAFF"),mk("ap","RECEPTION_STAFF"),mk("x","RECEPTION_STAFF")]);
    const category=await db.eventCategory.create({data:{name:`C-${run}`,slug:`c-${randomUUID()}`}});
    const day=new Date(Date.now()+20*86400000);
    const base={categoryId:category.id,description:"テスト用イベントです。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity:50,price:10000,organizer:"主催",applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED" as const};
    eventId=(await db.event.create({data:{...base,name:"集金テスト",managerId:u.mgr.id,lineNotifications:true}})).id;
    event2Id=(await db.event.create({data:{...base,name:"集金テスト2",managerId:u.mgr2.id}})).id;
    const buyer=await db.participant.create({data:{name:"購入者A",nameKana:"ア",phone:`090${Math.floor(Math.random()*1e8).toString().padStart(8,"0")}`,email:`a-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}});
    orderId=(await db.ticketOrder.create({data:{eventId,buyerParticipantId:buyer.id,quantity:3,claimedCount:1}})).id;
    const mkTicket=async(orderRef:string|null,claimed:boolean)=>{const id=randomUUID();await db.ticket.create({data:{id,eventId,orderId:orderRef,participantId:buyer.id,ticketNumber:`C-${randomUUID().slice(0,8)}`,qrTokenHash:tok.hashTicketToken(tok.issueTicketToken(id,1,secret)),status:"PROVISIONAL",paymentStatus:"UNPAID",claimed}});return id};
    for(let i=0;i<3;i++)orderTickets.push(await mkTicket(orderId,i===0));
    await db.eventRegistration.create({data:{eventId,participantId:buyer.id,ticketId:orderTickets[0],applicationSource:"WEB"}});
    solo=await mkTicket(null,true);
  });
  afterAll(async()=>{await db?.$disconnect()});

  it("T18 担当者別に集金を割り当て、担当外の情報は見えない（T28）",async()=>{
    as("mgr");expect((await call(()=>act.setCollectorRole(eventId,form({userId:u.c1.id,mode:"add"})))).code).toBe("collector_added");await call(()=>act.setCollectorRole(eventId,form({userId:u.c2.id,mode:"add"})));
    expect((await call(()=>act.assignCollector(eventId,form({target:`order:${orderId}`,collectorId:u.c1.id})))).code).toBe("assigned");
    await call(()=>act.assignCollector(eventId,form({target:`ticket:${solo}`,collectorId:u.c2.id})));
    expect((await call(()=>act.assignCollector(eventId,form({target:`order:${orderId}`,collectorId:u.x.id})))).code).toBe("invalid_collector");
    const v1=await data.getCollectionView(u.c1,eventId);expect(v1!.groups.map(g=>g.key)).toEqual([`order:${orderId}`]);
    const v2=await data.getCollectionView(u.c2,eventId);expect(v2!.groups.map(g=>g.key)).toEqual([`ticket:${solo}`]);
    expect(await data.getCollectionView(u.x,eventId)).toBeNull();expect(await data.getCollectionView(u.mgr2,eventId)).toBeNull();
    expect((await data.getCollectionView(u.mgr,eventId))!.groups).toHaveLength(2);
    as("c1");expect(await denied(()=>act.setCollectorRole(eventId,form({userId:u.x.id,mode:"add"})))).toBe(true);
  });
  it("担当外の集金担当は入金を登録できない",async()=>{
    as("c2");expect(await denied(()=>act.recordReceipt(eventId,form({target:`order:${orderId}`,amount:"1000",method:"CASH",receivedAt:today})))).toBe(true);
    as("x");expect(await denied(()=>act.recordReceipt(eventId,form({target:`order:${orderId}`,amount:"1000",method:"CASH",receivedAt:today})))).toBe(true);
    expect(await db.collectionReceipt.count({where:{eventId}})).toBe(0);
  });
  it("T19/T20 分割入金で未収金が減り、超過入金は拒否され、全額で入金確認される",async()=>{
    expect((await receipt("c1",`order:${orderId}`,10000)).code).toBe("saved");
    let v=await data.getCollectionView(u.c1,eventId);expect(v!.groups[0]).toMatchObject({billed:30000,received:10000,unpaid:20000,status:"PARTIAL"});
    expect((await db.ticket.findMany({where:{orderId}})).every(t=>t.paymentStatus==="UNPAID")).toBe(true);
    expect((await receipt("c1",`order:${orderId}`,15000)).code).toBe("saved");
    expect((await receipt("c1",`order:${orderId}`,6000)).code).toBe("overpayment");
    v=await data.getCollectionView(u.c1,eventId);expect(v!.groups[0]).toMatchObject({received:25000,unpaid:5000});
    expect((await receipt("c1",`order:${orderId}`,5000)).code).toBe("saved");
    const tickets=await db.ticket.findMany({where:{orderId},include:{payments:true}});
    expect(tickets.every(t=>t.paymentStatus==="PAID"&&t.status==="ACTIVE"&&t.payments.length===1&&t.payments[0].amount===10000)).toBe(true);
    expect((await receipt("c1",`order:${orderId}`,1000)).code).toBe("already_paid");
    expect(await db.collectionReceipt.count({where:{eventId,orderId}})).toBe(3);
    expect(await db.auditLog.count({where:{action:"COLLECTION_RECEIPT_RECORDED"}})).toBeGreaterThanOrEqual(3);
  });
  it("全額入金済みの注文の入金は取り消せない／途中の入金は理由付きで取り消せる",async()=>{
    const r=await db.collectionReceipt.findFirstOrThrow({where:{eventId,orderId}});as("c1");
    expect((await call(()=>act.voidReceipt(eventId,form({receiptId:r.id,reason:"誤入力のため"})))).code).toBe("fully_paid_lock");
    expect((await receipt("c2",`ticket:${solo}`,4000)).code).toBe("saved");
    const s=await db.collectionReceipt.findFirstOrThrow({where:{eventId,ticketId:solo}});
    as("c1");expect(await denied(()=>act.voidReceipt(eventId,form({receiptId:s.id,reason:"他人の入金"})))).toBe(true);
    as("c2");expect((await call(()=>act.voidReceipt(eventId,form({receiptId:s.id,reason:""})))).code).toBe("invalid");
    expect((await call(()=>act.voidReceipt(eventId,form({receiptId:s.id,reason:"誤入力のため"})))).code).toBe("voided");
    expect((await call(()=>act.voidReceipt(eventId,form({receiptId:s.id,reason:"誤入力のため"})))).code).toBe("already_voided");
    const v=await data.getCollectionView(u.c2,eventId);expect(v!.groups[0]).toMatchObject({received:0,unpaid:10000,status:"UNPAID"});
    expect((await db.collectionReceipt.findUniqueOrThrow({where:{id:s.id}})).voidReason).toBe("誤入力のため");
  });
  it("同時に入金を登録しても請求額を超えない",async()=>{
    as("c2");const r=await Promise.all([receipt("c2",`ticket:${solo}`,6000),receipt("c2",`ticket:${solo}`,6000)]);
    const sum=(await db.collectionReceipt.findMany({where:{ticketId:solo,status:"RECORDED"}})).reduce((n,x)=>n+x.amount,0);
    expect(sum).toBeLessThanOrEqual(10000);expect(r.filter(x=>x.code==="saved").length).toBe(1);
  });
  it("T21 参加費立替を記録し、回収を部分・全額で管理する",async()=>{
    as("c1");expect((await call(()=>adv.recordFeeAdvance(eventId,form({obligorName:"友人B",advancerName:"購入者A",target:`order:${orderId}`,amount:"10000",advancedAt:today,method:"CASH",evidenceNote:"メモ"})))).code).toBe("fee_saved");
    const f=await db.feeAdvance.findFirstOrThrow({where:{eventId}});expect(f.status).toBe("OPEN");
    expect((await call(()=>adv.recordFeeRecovery(eventId,form({feeAdvanceId:f.id,amount:"4000",recoveredAt:today,method:"CASH"})))).code).toBe("recovery_saved");
    expect((await db.feeAdvance.findUniqueOrThrow({where:{id:f.id}})).status).toBe("PARTIALLY_RECOVERED");
    expect((await call(()=>adv.recordFeeRecovery(eventId,form({feeAdvanceId:f.id,amount:"7000",recoveredAt:today,method:"CASH"})))).code).toBe("exceeds_balance");
    expect((await call(()=>adv.cancelFeeAdvance(eventId,form({feeAdvanceId:f.id})))).code).toBe("has_records");
    expect((await call(()=>adv.recordFeeRecovery(eventId,form({feeAdvanceId:f.id,amount:"6000",recoveredAt:today,method:"CASH"})))).code).toBe("recovery_saved");
    expect((await db.feeAdvance.findUniqueOrThrow({where:{id:f.id}})).status).toBe("RECOVERED");
    as("c2");expect((await call(()=>adv.recordFeeAdvance(eventId,form({obligorName:"X",advancerName:"Y",target:`order:${orderId}`,amount:"1000",advancedAt:today,method:"CASH"})))).code).toBe("forbidden");
    as("x");expect(await denied(()=>adv.recordFeeAdvance(eventId,form({obligorName:"X",advancerName:"Y",amount:"1000",advancedAt:today,method:"CASH"})))).toBe(true);
  });
  it("T22/T23 経費立替は承認時に1回だけ経費計上され、精算（返済）で再計上されない",async()=>{
    await db.eventRoleAssignment.create({data:{eventId,userId:u.ap.id,role:"APPROVER",assignedBy:u.admin.id}});
    as("c1");expect((await call(()=>adv.requestExpenseAdvance(eventId,form({advancerName:"小澤",category:"会場費",payee:"店舗",amount:"20000",paidAt:today,evidenceNote:"領収書あり"})))).code).toBe("expense_requested");
    const e=await db.expenseAdvance.findFirstOrThrow({where:{eventId,category:"会場費"}});expect(e.status).toBe("REQUESTED");
    const decide=(k:string,decision:string,reason?:string)=>{as(k);return call(()=>adv.decideExpenseAdvance(eventId,form({id:e.id,decision,...(reason?{reason}:{})})))};
    as("c1");expect(await denied(()=>adv.decideExpenseAdvance(eventId,form({id:e.id,decision:"approve"})))).toBe(true);
    as("mgr");expect(await denied(()=>adv.decideExpenseAdvance(eventId,form({id:e.id,decision:"approve"})))).toBe(true);
    as("admin");expect(await denied(()=>adv.decideExpenseAdvance(eventId,form({id:e.id,decision:"approve"})))).toBe(true);
    expect((await decide("ap","review")).code).toBe("expense_reviewing");
    const before=await db.eventExpense.count({where:{eventId}});
    expect((await decide("ap","approve")).code).toBe("expense_approved");
    expect((await decide("ap","approve")).code).toBe("invalid_transition");
    expect(await db.eventExpense.count({where:{eventId}})).toBe(before+1);
    const approved=await db.expenseAdvance.findUniqueOrThrow({where:{id:e.id},include:{expense:true}});expect(approved.expense).toMatchObject({amount:20000,eventId});
    const settle=(amount:string)=>{as("ap");return call(()=>adv.recordExpenseSettlement(eventId,form({id:e.id,amount,settledAt:today,method:"BANK_TRANSFER"})))};
    expect((await settle("8000")).code).toBe("settlement_saved");expect((await db.expenseAdvance.findUniqueOrThrow({where:{id:e.id}})).status).toBe("PARTIALLY_SETTLED");
    expect((await settle("13000")).code).toBe("exceeds_balance");
    expect((await settle("12000")).code).toBe("settlement_saved");expect((await db.expenseAdvance.findUniqueOrThrow({where:{id:e.id}})).status).toBe("SETTLED");
    expect((await settle("1")).code).toBe("invalid_transition");
    expect(await db.eventExpense.count({where:{eventId}})).toBe(before+1);
    as("c1");expect((await call(()=>adv.cancelExpenseAdvance(eventId,form({id:e.id})))).code).toBe("invalid_transition");
  });
  it("差戻し→修正再申請→承認、自己承認・理由なし差戻しの禁止",async()=>{
    as("c1");await call(()=>adv.requestExpenseAdvance(eventId,form({advancerName:"伴",category:"備品",payee:"文具店",amount:"3000",paidAt:today})));
    const e=await db.expenseAdvance.findFirstOrThrow({where:{eventId,category:"備品"}});
    const decide=(k:string,decision:string,reason?:string)=>{as(k);return call(()=>adv.decideExpenseAdvance(eventId,form({id:e.id,decision,...(reason?{reason}:{})})))};
    expect((await decide("ap","return")).code).toBe("reason_required");
    expect((await decide("ap","return","領収書を添付してください")).code).toBe("expense_returned");
    expect((await db.expenseAdvance.findUniqueOrThrow({where:{id:e.id}})).returnReason).toContain("領収書");
    as("c2");expect(await denied(()=>adv.resubmitExpenseAdvance(eventId,form({id:e.id,advancerName:"伴",category:"備品",payee:"文具店",amount:"3500",paidAt:today})))).toBe(true);
    as("c1");expect((await call(()=>adv.resubmitExpenseAdvance(eventId,form({id:e.id,advancerName:"伴",category:"備品",payee:"文具店",amount:"3500",paidAt:today,evidenceNote:"添付済み"})))).code).toBe("expense_resubmitted");
    const re=await db.expenseAdvance.findUniqueOrThrow({where:{id:e.id}});expect(re).toMatchObject({status:"REQUESTED",amount:3500,returnReason:null});
    expect((await decide("ap","approve")).code).toBe("expense_approved");
    as("ap");await db.eventRoleAssignment.update({where:{eventId_userId_role:{eventId,userId:u.c1.id,role:"COLLECTOR"}},data:{}});
    await db.eventRoleAssignment.create({data:{eventId,userId:u.ap.id,role:"COLLECTOR"}}).catch(()=>{});
    as("ap");await call(()=>adv.requestExpenseAdvance(eventId,form({advancerName:"自分",category:"交通費",payee:"鉄道",amount:"1000",paidAt:today})));
    const own=await db.expenseAdvance.findFirstOrThrow({where:{eventId,category:"交通費"}});
    expect((await call(()=>adv.decideExpenseAdvance(eventId,form({id:own.id,decision:"approve"})))).code).toBe("self_approval");
  });
  it("承認者が未設定のイベントでは、SUPER_ADMINだけが暫定的に承認できる",async()=>{
    as("mgr2");await call(()=>adv.requestExpenseAdvance(event2Id,form({advancerName:"管理者2",category:"会場費",payee:"店",amount:"5000",paidAt:today})));
    const e=await db.expenseAdvance.findFirstOrThrow({where:{eventId:event2Id}});
    as("mgr2");expect(await denied(()=>adv.decideExpenseAdvance(event2Id,form({id:e.id,decision:"approve"})))).toBe(true);
    as("admin");expect((await call(()=>adv.decideExpenseAdvance(event2Id,form({id:e.id,decision:"approve"})))).code).toBe("expense_approved");
  });
  it("他イベントのデータは操作・参照できない",async()=>{
    as("mgr2");expect(await denied(()=>act.recordReceipt(eventId,form({target:`order:${orderId}`,amount:"1000",method:"CASH",receivedAt:today})))).toBe(true);
    expect(await data.getAdvancesView(u.mgr2,eventId)).toBeNull();
    const view=await data.getAdvancesView(u.c1,eventId);expect(view!.expenseAdvances.every(x=>x.requestedBy===u.c1.id)).toBe(true);
    expect((await data.getAdvancesView(u.ap,eventId))!.expenseAdvances.length).toBeGreaterThanOrEqual(3);
  });
});
