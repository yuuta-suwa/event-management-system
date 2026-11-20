import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
const state=vi.hoisted(()=>({user:{id:"",role:"SUPER_ADMIN",name:"x"} as {id:string;role:string;name:string}|null}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async(roles?:string[])=>{if(!state.user)throw new Error("UNAUTH");if(roles&&!roles.includes(state.user.role))throw new Error("FORBIDDEN");return state.user},validatedSessionUser:async()=>state.user}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
describe.skipIf(!enabled)("帳簿からの過去イベント追加・イベント名の変更（実DB・使い捨てテストDBのみ）",()=>{
  let db:typeof import("@/server/db").db;let svc:typeof import("@/features/roster/event-service");let act:typeof import("@/features/roster/event-actions");let imp:typeof import("@/features/roster/backfill-service");let dom:typeof import("@/features/roster/backfill-domain");let books:typeof import("@/features/ledger/books");
  let year=2000;const u:Record<string,{id:string;role:string;name:string}>={};const run=randomUUID().slice(0,6);
  const as=(k:string)=>{state.user=u[k]};
  const f=(o:Record<string,string>)=>{const x=new FormData();for(const [k,v] of Object.entries(o))x.set(k,v);return x};
  const go=async(fn:()=>Promise<unknown>)=>{try{await fn();return "none"}catch(e){return (e as Error).message}};
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:"b".repeat(48)});
    ({db}=await import("@/server/db"));svc=await import("@/features/roster/event-service");act=await import("@/features/roster/event-actions");imp=await import("@/features/roster/backfill-service");dom=await import("@/features/roster/backfill-domain");books=await import("@/features/ledger/books");
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF")=>{const x=await db.user.create({data:{name:`${key}-${run}`,email:`${key}-${run}@example.com`,role}});u[key]={id:x.id,role,name:x.name}};
    await Promise.all([mk("admin","SUPER_ADMIN"),mk("mgr","EVENT_MANAGER"),mk("mgr2","EVENT_MANAGER"),mk("staff","RECEPTION_STAFF")]);
    for(let i=0;i<200;i++){const y=1995+Math.floor(Math.random()*40);if(!await db.event.count({where:{eventDate:{gte:new Date(`${y}-01-01T00:00:00+09:00`),lt:new Date(`${y+1}-01-01T00:00:00+09:00`)}}})){year=y;break}}
  });
  afterAll(async()=>{await db?.$disconnect()});

  it("過去のイベントを追加: 終了済み・非公開で作られ、その月の帳簿に出る。通知・申込は作られない",async()=>{
    const r=await svc.createPastEvent(u.mgr,{name:` 1月の交流会 ${run} `,day:`${year}-01-20`,price:"3,000",venue:"",startTime:"19:00"});
    if(!r.ok)throw new Error(r.error);
    const e=await db.event.findUniqueOrThrow({where:{id:r.eventId}});
    expect(e).toMatchObject({name:`1月の交流会 ${run}`,status:"CLOSED",price:3000,managerId:u.mgr.id,venueName:"（過去の記録）"});
    expect(e.startTime.toISOString()).toBe(new Date(`${year}-01-20T19:00:00+09:00`).toISOString());
    expect(await db.auditLog.count({where:{action:"PAST_EVENT_CREATED",entityId:e.id}})).toBe(1);
    expect(await db.emailLog.count({where:{eventId:e.id}})+await db.notificationJob.count({where:{eventId:e.id}})).toBe(0);
    const b=await books.loadBook(u.admin,year,1);
    expect(b.events.find(x=>x.id===e.id)).toMatchObject({name:`1月の交流会 ${run}`,canEdit:true});
    // 2回目は同じ「過去の記録」カテゴリーを使う
    const r2=await svc.createPastEvent(u.mgr,{name:`2月の交流会 ${run}`,day:`${year}-02-03`,price:"",venue:"渋谷"});
    if(!r2.ok)throw new Error(r2.error);
    expect((await db.event.findUniqueOrThrow({where:{id:r2.eventId}})).categoryId).toBe(e.categoryId);
    expect(await db.eventCategory.count({where:{name:svc.PAST_EVENT_CATEGORY}})).toBe(1);
  });
  it("入力チェックと権限: 名前・日付・参加費が不正なら作らない。受付スタッフは不可",async()=>{
    const before=await db.event.count();
    expect(await svc.createPastEvent(u.mgr,{name:"A",day:`${year}-01-01`,price:"0"})).toEqual({ok:false,error:"invalid_name"});
    expect(await svc.createPastEvent(u.mgr,{name:"正しい名前",day:"2026-02-30",price:"0"})).toEqual({ok:false,error:"invalid_date"});
    expect(await svc.createPastEvent(u.mgr,{name:"正しい名前",day:`${year}-01-01`,price:"-5"})).toEqual({ok:false,error:"invalid_price"});
    expect(await svc.createPastEvent(u.staff,{name:"正しい名前",day:`${year}-01-01`,price:"0"})).toEqual({ok:false,error:"forbidden"});
    expect(await svc.createPastEvent({id:"nobody"},{name:"正しい名前",day:`${year}-01-01`,price:"0"})).toEqual({ok:false,error:"forbidden"});
    expect(await db.event.count()).toBe(before);
  });
  it("イベント名の変更: 理由必須。変更前後・理由・直した人が履歴に残る。権限のない人は変えられない",async()=>{
    const ev=await db.event.findFirstOrThrow({where:{name:`1月の交流会 ${run}`}});
    expect(await svc.renameEvent(u.mgr,{eventId:ev.id,name:"新しい名前",reason:""})).toEqual({ok:false,error:"reason_required"});
    expect(await svc.renameEvent(u.mgr,{eventId:ev.id,name:"新しい名前",reason:"  "})).toEqual({ok:false,error:"reason_required"});
    expect(await svc.renameEvent(u.mgr,{eventId:ev.id,name:"X",reason:"理由"})).toEqual({ok:false,error:"invalid_name"});
    expect(await svc.renameEvent(u.mgr,{eventId:ev.id,name:ev.name,reason:"同じ"})).toEqual({ok:false,error:"no_change"});
    expect(await svc.renameEvent(u.mgr2,{eventId:ev.id,name:"新しい名前",reason:"他人"})).toEqual({ok:false,error:"forbidden"});
    expect(await svc.renameEvent(u.staff,{eventId:ev.id,name:"新しい名前",reason:"スタッフ"})).toEqual({ok:false,error:"forbidden"});
    expect(await svc.renameEvent({id:"nobody"},{eventId:ev.id,name:"新しい名前",reason:"偽"})).toEqual({ok:false,error:"forbidden"});
    expect(await svc.renameEvent(u.mgr,{eventId:randomUUID(),name:"新しい名前",reason:"x"})).toEqual({ok:false,error:"not_found"});
    expect((await db.event.findUniqueOrThrow({where:{id:ev.id}})).name).toBe(ev.name);
    expect(await svc.renameEvent(u.mgr,{eventId:ev.id,name:`  正式名称 ${run}　`,reason:"正式名称に合わせて修正"})).toEqual({ok:true,eventId:ev.id});
    expect((await db.event.findUniqueOrThrow({where:{id:ev.id}})).name).toBe(`正式名称 ${run}`);
    expect(await svc.renameEvent(u.admin,{eventId:ev.id,name:`再変更 ${run}`,reason:"管理者が再修正"})).toMatchObject({ok:true});
    const h=await svc.listEventRenames(ev.id);
    expect(h.map(x=>[x.before,x.after,x.reason,x.editor])).toEqual([[`正式名称 ${run}`,`再変更 ${run}`,"管理者が再修正",u.admin.name],[ev.name,`正式名称 ${run}`,"正式名称に合わせて修正",u.mgr.name]]);
  });
  it("画面のServer Action: 追加すると参加者の入力画面へ、名前変更は帳簿へ戻る。不正なback先は無視する。権限のない人は拒否",async()=>{
    as("mgr");
    const added=await go(()=>act.addPastEvent(f({name:`画面追加 ${run}`,day:`${year}-03-05`,price:"2500",venue:"",startTime:"18:00",back:`/ledger/books?year=${year}&month=3`})));
    const created=await db.event.findFirstOrThrow({where:{name:`画面追加 ${run}`}});
    expect(added).toBe(`REDIRECT:/participants/import?event=${created.id}&created=1`);
    expect(await go(()=>act.addPastEvent(f({name:"",day:`${year}-03-05`,price:"0",back:`/ledger/books?year=${year}&month=3`})))).toBe(`REDIRECT:/ledger/books?year=${year}&month=3&error=invalid_name`);
    expect(await go(()=>act.addPastEvent(f({name:"",day:`${year}-03-05`,price:"0",back:"https://evil.example/"})))).toBe("REDIRECT:/ledger/books?error=invalid_name");
    expect(await go(()=>act.renameEventAction(f({eventId:created.id,name:`画面名前 ${run}`,reason:"画面確認",back:`/ledger/books?year=${year}&month=3`})))).toBe(`REDIRECT:/ledger/books?year=${year}&month=3&notice=event_renamed`);
    expect(await go(()=>act.renameEventAction(f({eventId:created.id,name:`画面名前2 ${run}`,reason:"",back:`/ledger/books?year=${year}`})))).toBe(`REDIRECT:/ledger/books/event?event=${created.id}&back=${encodeURIComponent(`/ledger/books?year=${year}`)}&error=reason_required`);
    as("staff");expect(await go(()=>act.addPastEvent(f({name:"スタッフ追加",day:`${year}-03-05`,price:"0"})))).toBe("FORBIDDEN");
    expect(await go(()=>act.renameEventAction(f({eventId:created.id,name:"スタッフ変更",reason:"x"})))).toBe("FORBIDDEN");
    expect(await db.event.count({where:{name:"スタッフ追加"}})).toBe(0);
  });
  it("追加したイベントに参加者を入力すると、人数・名簿・売上が帳簿に出る。各行に編集の手がかり(registrationId)がある。他のイベントの管理者は編集できない",async()=>{
    const ev=await db.event.findFirstOrThrow({where:{name:`再変更 ${run}`}});
    const rows=dom.parseRosterText(`山田${run},,,y-${run}@example.com,入金済み,3000,,現金,参加\n佐藤${run},,,s-${run}@example.com,入金済み,3000,,現金,欠席\n鈴木${run},,,k-${run}@example.com,未入金,,,,未受付`,{eventYear:year,defaults:{payment:"PAID",attendance:"ATTENDED",method:"BANK_TRANSFER",amount:null}});
    if(!rows.ok)throw new Error(rows.error);
    expect(await imp.importRoster(u.mgr,{eventId:ev.id,rows:rows.rows,commit:true})).toMatchObject({ok:true,counts:{created:3}});
    const b=await books.loadBook(u.admin,year,1);const e=b.events.find(x=>x.id===ev.id)!;
    expect(e).toMatchObject({attended:1,tickets:{sold:3,paid:2,sales:6000}});
    const people=b.attendees.filter(a=>a.eventId===ev.id);expect(people).toHaveLength(3);expect(people.every(p=>Boolean(p.registrationId))).toBe(true);
    expect(b.summary.months[0]).toMatchObject({sold:3,paid:2,sales:6000,attended:1});
    // 同じ帳簿でも、そのイベントの管理者でない人(システム管理者でもない)には編集の手がかりを出さない
    const other=await books.loadBook({id:u.mgr2.id,role:"EVENT_MANAGER"},year,1);
    expect(other.events.find(x=>x.id===ev.id)).toBeUndefined(); // 担当でなければそもそも見えない
    const mine=await books.loadBook({id:u.mgr.id,role:"EVENT_MANAGER"},year,1);expect(mine.events.find(x=>x.id===ev.id)?.canEdit).toBe(true);
    // 決裁権者として帳簿は見えるが、編集はできない
    await db.eventRoleAssignment.create({data:{eventId:ev.id,userId:u.staff.id,role:"APPROVER",assignedBy:u.admin.id}});
    const ap=await books.loadBook({id:u.staff.id,role:"RECEPTION_STAFF"},year,1);expect(ap.events.find(x=>x.id===ev.id)?.canEdit).toBe(false);
  });
});
