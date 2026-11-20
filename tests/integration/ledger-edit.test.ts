import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
const state=vi.hoisted(()=>({user:{id:"",role:"SUPER_ADMIN",name:"x"} as {id:string;role:string;name:string}|null}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async(roles?:string[])=>{if(!state.user)throw new Error("UNAUTH");if(roles&&!roles.includes(state.user.role))throw new Error("FORBIDDEN");return state.user},validatedSessionUser:async()=>state.user}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
describe.skipIf(!enabled)("帳簿の編集: 理由つき・履歴が残る（実DB・使い捨てテストDBのみ）",()=>{
  let db:typeof import("@/server/db").db;let svc:typeof import("@/features/ledger/edit-service");let act:typeof import("@/features/ledger/edit-actions");let adv:typeof import("@/features/collection/advance-actions");let ledger:typeof import("@/features/ledger/data");let csv:typeof import("@/features/ledger/csv");let dom:typeof import("@/features/ledger/edit-domain");let editData:typeof import("@/features/ledger/edit-data");
  let eventId:string,otherEventId:string;const u:Record<string,{id:string;role:string;name:string}>={};const run=randomUUID().slice(0,6);
  const as=(k:string)=>{state.user=u[k]};
  const form=(o:Record<string,string>)=>{const f=new FormData();for(const [k,v] of Object.entries(o))f.set(k,v);return f};
  async function call(fn:()=>Promise<unknown>){try{await fn();return "none"}catch(e){const m=e instanceof Error?e.message:"";if(m.startsWith("REDIRECT:")){const q=new URL(m.slice(9),"http://x").searchParams;return q.get("error")??q.get("notice")!}if(m==="FORBIDDEN")return "forbidden";throw e}}
  const today="2026-11-19";
  async function expense(label="会場費",amount=10000,note:string|null=null,ev=eventId){return db.eventExpense.create({data:{eventId:ev,label,amount,note}})}
  /** 画面と同じ手順(現在値のスナップショットつき)で編集する */
  async function edit(who:string,type:"EventExpense"|"FeeAdvance"|"ExpenseAdvance",id:string,fields:Record<string,unknown>,reason:unknown="入力ミスの訂正",snapshot=true){
    const t=await editData.loadEditTarget(db,type,id);
    const cur=t?Object.fromEntries(Object.entries(t.values).map(([k,v])=>[k,v===null?"":String(v)])):{};
    return svc.applyLedgerEdit(u[who],{type,id,reason,fields:{...cur,...fields},snapshot:snapshot&&t?dom.snapshotOf(t.values):undefined});
  }
  const revs=(entityId:string)=>db.ledgerRevision.findMany({where:{entityId},orderBy:{createdAt:"asc"}});
  async function feeAdvance(amount="3000"){as("mgr");await call(()=>adv.recordFeeAdvance(eventId,form({obligorName:"立替対象 太郎",advancerName:"立替 花子",amount,advancedAt:today,method:"CASH"})));return db.feeAdvance.findFirstOrThrow({where:{eventId},orderBy:{createdAt:"desc"}})}
  async function approvedExpenseAdvance(amount="4000"){
    as("mgr");await call(()=>adv.requestExpenseAdvance(eventId,form({advancerName:"立替 次郎",category:"備品代",payee:"文具店",amount,paidAt:today})));
    const a=await db.expenseAdvance.findFirstOrThrow({where:{eventId},orderBy:{createdAt:"desc"}});
    as("ap");expect(await call(()=>adv.decideExpenseAdvance(eventId,form({id:a.id,decision:"approve"})))).toBe("expense_approved");
    return db.expenseAdvance.findUniqueOrThrow({where:{id:a.id}});
  }
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url});
    ({db}=await import("@/server/db"));svc=await import("@/features/ledger/edit-service");act=await import("@/features/ledger/edit-actions");adv=await import("@/features/collection/advance-actions");ledger=await import("@/features/ledger/data");csv=await import("@/features/ledger/csv");dom=await import("@/features/ledger/edit-domain");editData=await import("@/features/ledger/edit-data");
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF")=>{const x=await db.user.create({data:{name:`${key}-${run}`,email:`${key}-${run}@example.com`,role}});u[key]={id:x.id,role,name:x.name}};
    await Promise.all([mk("admin","SUPER_ADMIN"),mk("mgr","EVENT_MANAGER"),mk("mgr2","EVENT_MANAGER"),mk("ap","RECEPTION_STAFF"),mk("staff","RECEPTION_STAFF")]);
    const category=await db.eventCategory.create({data:{name:`LE-${run}`,slug:`le-${randomUUID()}`}});
    const base=()=>{const day=new Date(Date.now()+86400000*30);return {categoryId:category.id,description:"テスト用イベントです。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity:50,price:10000,organizer:"主催",applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED" as const}};
    eventId=(await db.event.create({data:{...base(),name:`編集A-${run}`,managerId:u.mgr.id}})).id;
    otherEventId=(await db.event.create({data:{...base(),name:`編集B-${run}`,managerId:u.mgr2.id}})).id;
    await db.eventRoleAssignment.create({data:{eventId,userId:u.ap.id,role:"APPROVER",assignedBy:u.admin.id}});
    await db.eventRoleAssignment.create({data:{eventId,userId:u.mgr.id,role:"COLLECTOR"}}).catch(()=>{});
  });
  afterAll(async()=>{await db?.$disconnect()});

  it("経費を直す: 内容が変わり、理由・直した人・変更前後が履歴に残り、帳簿の収支にも反映される",async()=>{
    const e=await expense("会場費",10000,"仮");
    const before=(await ledger.buildLedger(eventId))!;
    const r=await edit("mgr","EventExpense",e.id,{label:"会場費(訂正)",amount:"12000",note:"領収書どおり"},"領収書の金額に合わせて訂正");
    expect(r.ok).toBe(true);
    const row=await db.eventExpense.findUniqueOrThrow({where:{id:e.id}});expect(row).toMatchObject({label:"会場費(訂正)",amount:12000,note:"領収書どおり"});
    const [rev]=await revs(e.id);
    expect(rev).toMatchObject({eventId,entityType:"EventExpense",editedBy:u.mgr.id,reason:"領収書の金額に合わせて訂正",summary:"会場費"});
    expect(rev.changes).toEqual([{field:"label",label:"項目名",before:"会場費",after:"会場費(訂正)"},{field:"amount",label:"金額",before:10000,after:12000},{field:"note",label:"備考",before:"仮",after:"領収書どおり"}]);
    expect(await db.auditLog.count({where:{action:"LEDGER_ENTRY_EDITED",entityId:e.id}})).toBe(1);
    const l=(await ledger.buildLedger(eventId))!;
    expect(l.expenses.total).toBe(before.expenses.total+2000);expect(l.balance).toBe(before.balance-2000);
    const entry=l.entries.find(x=>x.ref?.id===e.id)!;expect(entry).toMatchObject({category:"経費",description:"会場費(訂正)",amount:12000,edits:1});
    expect(l.revisions[0]).toMatchObject({entityId:e.id,editor:u.mgr.name,reason:"領収書の金額に合わせて訂正"});
  });
  it("理由が空・空白だけなら保存されない(何も変わらず、履歴も増えない)",async()=>{
    const e=await expense("印刷費",5000);
    for(const reason of ["","   ",null]){const r=await edit("mgr","EventExpense",e.id,{amount:"6000"},reason);expect(r).toMatchObject({ok:false,error:"reason_required"})}
    expect((await db.eventExpense.findUniqueOrThrow({where:{id:e.id}})).amount).toBe(5000);expect(await revs(e.id)).toHaveLength(0);
  });
  it("変更がなければ保存しない。不正な入力(負の金額・空の項目名)も弾く",async()=>{
    const e=await expense("備品",3000);
    expect(await edit("mgr","EventExpense",e.id,{})).toMatchObject({ok:false,error:"no_change"});
    expect(await edit("mgr","EventExpense",e.id,{amount:"-1"})).toMatchObject({ok:false,error:"invalid",fieldErrors:{amount:expect.any(String)}});
    expect(await edit("mgr","EventExpense",e.id,{label:"  "})).toMatchObject({ok:false,error:"invalid"});
    expect(await revs(e.id)).toHaveLength(0);
  });
  it("権限: システム管理者・担当イベントの管理者・決裁権者は編集できる。他イベントの管理者・受付スタッフ・参加者は不可",async()=>{
    const e=await expense("権限確認",1000);
    expect(await edit("staff","EventExpense",e.id,{amount:"1100"})).toMatchObject({ok:false,error:"forbidden"});
    expect(await edit("mgr2","EventExpense",e.id,{amount:"1100"})).toMatchObject({ok:false,error:"forbidden"});
    expect((await db.eventExpense.findUniqueOrThrow({where:{id:e.id}})).amount).toBe(1000);
    expect((await edit("ap","EventExpense",e.id,{amount:"1100"})).ok).toBe(true);
    expect((await edit("mgr","EventExpense",e.id,{amount:"1200"})).ok).toBe(true);
    expect((await edit("admin","EventExpense",e.id,{amount:"1300"})).ok).toBe(true);
    expect((await revs(e.id)).map(r=>r.editedBy)).toEqual([u.ap.id,u.mgr.id,u.admin.id]);
    // 偽のユーザーIDで呼んでも通らない(サーバー側で権限を判定)
    expect(await svc.applyLedgerEdit({id:"nobody"},{type:"EventExpense",id:e.id,reason:"x",fields:{label:"x",amount:"1"}})).toMatchObject({ok:false,error:"forbidden"});
  });
  it("他の人が先に直していたら(古い画面からの保存)、上書きせずに止める。履歴は順に残る",async()=>{
    const e=await expense("競合確認",1000);
    const t=await editData.loadEditTarget(db,"EventExpense",e.id);const oldSnap=dom.snapshotOf(t!.values);
    expect((await edit("mgr","EventExpense",e.id,{amount:"1500"})).ok).toBe(true);
    const r=await svc.applyLedgerEdit(u.admin,{type:"EventExpense",id:e.id,reason:"古い画面から",fields:{label:"競合確認",amount:"9999",note:""},snapshot:oldSnap});
    expect(r).toMatchObject({ok:false,error:"stale"});
    expect((await db.eventExpense.findUniqueOrThrow({where:{id:e.id}})).amount).toBe(1500);expect(await revs(e.id)).toHaveLength(1);
  });
  it("参加費立替: 日付・金額を直せる。回収済みより小さくは不可。金額を回収額に合わせると状態が自動で変わる",async()=>{
    const f=await feeAdvance("3000");
    as("mgr");expect(await call(()=>adv.recordFeeRecovery(eventId,form({feeAdvanceId:f.id,amount:"1000",recoveredAt:today,method:"CASH"})))).toBe("recovery_saved");
    expect((await db.feeAdvance.findUniqueOrThrow({where:{id:f.id}})).status).toBe("PARTIALLY_RECOVERED");
    expect(await edit("mgr","FeeAdvance",f.id,{amount:"900"})).toMatchObject({ok:false,error:"below_recovered"});
    const r=await edit("ap","FeeAdvance",f.id,{amount:"1000",advancedAt:"2026-11-01",advancerName:"立替 花子(訂正)"},"実際の立替額は1,000円だった");
    expect(r.ok).toBe(true);
    const row=await db.feeAdvance.findUniqueOrThrow({where:{id:f.id}});
    expect(row).toMatchObject({amount:1000,status:"RECOVERED",advancerName:"立替 花子(訂正)"});expect(dom.jstDay(row.advancedAt)).toBe("2026-11-01");
    const [rev]=await revs(f.id);
    expect(rev.changes).toEqual(expect.arrayContaining([{field:"amount",label:"立替額",before:3000,after:1000},{field:"status",label:"状態",before:"PARTIALLY_RECOVERED",after:"RECOVERED"}]));
    const l=(await ledger.buildLedger(eventId))!;expect(l.entries.find(x=>x.ref?.id===f.id)).toMatchObject({amount:1000,edits:1});
    // 立替額を戻すと「一部回収済み」に戻る
    expect((await edit("mgr","FeeAdvance",f.id,{amount:"2500"})).ok).toBe(true);expect((await db.feeAdvance.findUniqueOrThrow({where:{id:f.id}})).status).toBe("PARTIALLY_RECOVERED");
  });
  it("取消済みの立替は編集できない。立替予定は金額を直しても予定のまま",async()=>{
    const f=await feeAdvance("2000");as("mgr");expect(await call(()=>adv.cancelFeeAdvance(eventId,form({feeAdvanceId:f.id})))).toBe("fee_cancelled");
    expect(await edit("mgr","FeeAdvance",f.id,{amount:"2100"})).toMatchObject({ok:false,error:"not_found"});
    as("mgr");await call(()=>adv.recordFeeAdvance(eventId,form({obligorName:"予定 太郎",advancerName:"予定 花子",amount:"5000",advancedAt:today,method:"CASH",planned:"on"})));
    const p=await db.feeAdvance.findFirstOrThrow({where:{eventId,status:"PLANNED"},orderBy:{createdAt:"desc"}});
    expect((await edit("mgr","FeeAdvance",p.id,{amount:"5500"})).ok).toBe(true);
    expect(await db.feeAdvance.findUniqueOrThrow({where:{id:p.id}})).toMatchObject({amount:5500,status:"PLANNED"});
  });
  it("経費立替(承認済み): 金額・費目・支払先を直すと、計上済みの経費も同じ内容に直る(二重計上にならない)。精算済みより小さくは不可",async()=>{
    const a=await approvedExpenseAdvance("4000");expect(a.expenseId).toBeTruthy();
    as("ap");expect(await call(()=>adv.recordExpenseSettlement(eventId,form({id:a.id,amount:"1500",settledAt:today,method:"BANK_TRANSFER"})))).toBe("settlement_saved");
    const before=(await ledger.buildLedger(eventId))!;
    expect(await edit("ap","ExpenseAdvance",a.id,{amount:"1400"})).toMatchObject({ok:false,error:"below_settled"});
    const r=await edit("admin","ExpenseAdvance",a.id,{amount:"4500",category:"備品代(訂正)",payee:"文具店B"},"レシートの合計が4,500円だった");
    expect(r.ok).toBe(true);
    expect(await db.expenseAdvance.findUniqueOrThrow({where:{id:a.id}})).toMatchObject({amount:4500,category:"備品代(訂正)",payee:"文具店B",status:"PARTIALLY_SETTLED"});
    expect(await db.eventExpense.findUniqueOrThrow({where:{id:a.expenseId!}})).toMatchObject({amount:4500,label:"備品代(訂正)（立替：立替 次郎）",note:"支払先：文具店B"});
    const l=(await ledger.buildLedger(eventId))!;
    expect(l.expenses.total).toBe(before.expenses.total+500);expect(l.expenseAdvances.total).toBe(before.expenseAdvances.total+500);expect(l.expenseAdvances.settled).toBe(before.expenseAdvances.settled);
    // 精算額と同額まで下げると「精算済み」になる
    expect((await edit("ap","ExpenseAdvance",a.id,{amount:"1500"},"一部返品")).ok).toBe(true);
    expect(await db.expenseAdvance.findUniqueOrThrow({where:{id:a.id}})).toMatchObject({amount:1500,status:"SETTLED"});
    expect((await db.eventExpense.findUniqueOrThrow({where:{id:a.expenseId!}})).amount).toBe(1500);
  });
  it("立替から作られた経費は、帳簿の「経費」行からは金額を直せない(備考のみ)。金額を送っても無視される",async()=>{
    const a=await approvedExpenseAdvance("2000");
    const r=await edit("mgr","EventExpense",a.expenseId!,{amount:"99999",label:"勝手な名前",note:"備考だけ直す"},"備考の追記");
    expect(r.ok).toBe(true);
    expect(await db.eventExpense.findUniqueOrThrow({where:{id:a.expenseId!}})).toMatchObject({amount:2000,label:"備品代（立替：立替 次郎）",note:"備考だけ直す"});
    const [rev]=await revs(a.expenseId!);expect(rev.changes).toEqual([{field:"note",label:"備考",before:"支払先：文具店",after:"備考だけ直す"}]);
  });
  it("画面のServer Action: 成功すると帳簿へ、理由なしはエラー付きで編集画面へ戻る。権限のない人は編集画面でエラー",async()=>{
    const e=await expense("画面確認",2000);
    as("mgr");
    expect(await call(()=>act.editLedgerEntry(form({type:"EventExpense",id:e.id,label:"画面確認",amount:"2200",note:"",reason:""})))).toBe("reason_required");
    expect((await db.eventExpense.findUniqueOrThrow({where:{id:e.id}})).amount).toBe(2000);
    const ok=await (async()=>{try{await act.editLedgerEntry(form({type:"EventExpense",id:e.id,label:"画面確認",amount:"2200",note:"",reason:"金額訂正"}))}catch(x){return (x as Error).message}})();
    expect(ok).toBe(`REDIRECT:/ledger?event=${eventId}&notice=edited`);
    expect((await db.eventExpense.findUniqueOrThrow({where:{id:e.id}})).amount).toBe(2200);
    as("staff");expect(await call(()=>act.editLedgerEntry(form({type:"EventExpense",id:e.id,label:"x",amount:"1",note:"",reason:"不正"})))).toBe("forbidden");
    expect((await db.eventExpense.findUniqueOrThrow({where:{id:e.id}})).amount).toBe(2200);
    as("mgr");expect(await call(()=>act.editLedgerEntry(form({type:"Nope",id:e.id,reason:"x"})))).toBe("not_found");
  });
  it("CSVにも編集履歴（日時・編集者・対象・変更内容・理由）が出る。履歴のないイベントでは出ない",async()=>{
    const l=(await ledger.buildLedger(eventId))!;const text=csv.ledgerCsv(l);
    expect(text).toContain("編集日時");expect(text).toContain("領収書の金額に合わせて訂正");expect(text).toContain("金額: ¥10,000 → ¥12,000");
    const empty=(await ledger.buildLedger(otherEventId))!;expect(csv.ledgerCsv(empty)).not.toContain("編集日時");
  });
  it("履歴は編集ごとに積み上がり、消えない。別イベントの履歴には混ざらない",async()=>{
    const e=await expense("履歴確認",100,null,otherEventId);
    for(const n of ["200","300","400"])expect((await svc.applyLedgerEdit(u.admin,{type:"EventExpense",id:e.id,reason:`→${n}`,fields:{label:"履歴確認",amount:n,note:""}})).ok).toBe(true);
    const own=await editData.listRevisions(db,otherEventId,{entityType:"EventExpense",entityId:e.id});
    expect(own.map(r=>r.reason)).toEqual(["→400","→300","→200"]);
    expect((await editData.listRevisions(db,eventId)).some(r=>r.entityId===e.id)).toBe(false);
  });
});
