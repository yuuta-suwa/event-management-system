import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
const state=vi.hoisted(()=>({user:{id:"",role:"SUPER_ADMIN",name:"x"}}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async(roles?:string[])=>{if(roles&&!roles.includes(state.user.role))throw new Error("FORBIDDEN");return state.user},validatedSessionUser:async()=>state.user}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
describe.skipIf(!enabled)("申込のエラー処理・入力保持、管理者による決裁権者の直接指定（実DB・使い捨てテストDBのみ）",()=>{
  let db:typeof import("@/server/db").db;let reg:typeof import("@/features/participants/actions");let act:typeof import("@/features/ledger/approver-actions");
  let eventId:string,fullId:string;const u:Record<string,{id:string;role:string;name:string}>={};const run=randomUUID().slice(0,6);let seq=0;
  const form=(o:Record<string,string|number>)=>{const f=new FormData();for(const [k,v] of Object.entries(o))f.set(k,String(v));return f};
  const apply=(id:string,over:Record<string,string>={})=>{const n=++seq;return form({eventId:id,name:`申込${n}`,nameKana:"モウシコミ",phone:`090${String(1e7+n*37+Number(run.charCodeAt(0))).padStart(8,"0")}`,email:`reg${n}-${run}@example.com`,quantity:"1",privacy:"on",...over})};
  async function call(fn:()=>Promise<unknown>){try{return {thrown:null,value:await fn()}}catch(e){return {thrown:e instanceof Error?e.message:String(e),value:undefined}}}
  const approvers=async(id=eventId)=>(await db.eventRoleAssignment.findMany({where:{eventId:id,role:"APPROVER",active:true}})).map(a=>a.userId).sort();
  /** Prismaのメソッドはvi.spyOnで安全に復元できないため、代入で差し替えて必ず元に戻す。 */
  async function withTransaction<T>(impl:(orig:(...a:unknown[])=>unknown)=>(...a:unknown[])=>unknown,run:()=>Promise<T>){
    const holder=db as unknown as {$transaction:(...a:unknown[])=>unknown};const orig=holder.$transaction;
    holder.$transaction=impl(orig.bind(db));
    try{return await run()}finally{holder.$transaction=orig}
  }
  async function mkEvent(name:string,capacity:number){
    const category=await db.eventCategory.upsert({where:{slug:`reg-${run}`},update:{},create:{name:`R-${run}`,slug:`reg-${run}`}});
    const day=new Date(Date.now()+30*86400000);
    return (await db.event.create({data:{categoryId:category.id,name:`${name}-${run}`,description:"テスト用イベントです。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity,price:1000,organizer:"主催",managerId:u.mgr.id,applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED"}})).id;
  }
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:"t".repeat(48)});
    ({db}=await import("@/server/db"));reg=await import("@/features/participants/actions");act=await import("@/features/ledger/approver-actions");
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF"|"PARTICIPANT",status:"ACTIVE"|"SUSPENDED"="ACTIVE")=>{const x=await db.user.create({data:{name:`${key}-${run}`,email:`${key}-${run}@example.com`,role,status}});u[key]={id:x.id,role,name:x.name}};
    await Promise.all([mk("admin","SUPER_ADMIN"),mk("mgr","EVENT_MANAGER"),mk("staff","RECEPTION_STAFF"),mk("staff2","RECEPTION_STAFF"),mk("part","PARTICIPANT"),mk("off","RECEPTION_STAFF","SUSPENDED")]);
    eventId=await mkEvent("申込テスト",50);fullId=await mkEvent("満席テスト",1);
  });
  afterAll(async()=>{await db?.$disconnect()});

  it("申込が成功するとマイページ付きの完了画面へ進み、登録は1件だけ作られる",async()=>{
    const r=await call(()=>reg.registerParticipant({},apply(eventId)));
    expect(r.thrown).toMatch(/^REDIRECT:\/apply\/.+\/complete\?mine=/);
    expect(await db.eventRegistration.count({where:{eventId}})).toBe(1);
  });
  it("初回に一時的なDBエラー(トランザクション時間切れP2028)が起きても、自動で再試行して成功する（登録は1件のまま）",async()=>{
    let first=true;let calls=0;
    const before=await db.eventRegistration.count({where:{eventId}});
    const r=await withTransaction(orig=>(...a)=>{calls++;if(first){first=false;return Promise.reject(Object.assign(new Error("Transaction already closed"),{code:"P2028"}))}return orig(...a)},()=>call(()=>reg.registerParticipant({},apply(eventId))));
    expect(r.thrown).toMatch(/^REDIRECT:\/apply\/.+\/complete\?mine=/);
    expect(calls).toBe(2);
    expect(await db.eventRegistration.count({where:{eventId}})).toBe(before+1);
  });
  it("再試行しても失敗する場合は、エラー画面に飛ばさず、入力内容を保持したままメッセージを返す",async()=>{
    const err=vi.spyOn(console,"error").mockImplementation(()=>{});
    const r=await withTransaction(()=>()=>Promise.reject(Object.assign(new Error("Transaction already closed"),{code:"P2028"})),()=>call(()=>reg.registerParticipant({},apply(eventId,{name:"保持太郎",notes:"備考メモ",age:"30"}))));
    err.mockRestore();
    expect(r.thrown).toBeNull();
    const s=r.value as {message?:string;values?:Record<string,string>};
    expect(s.message).toContain("入力内容はそのまま残っています");
    expect(s.values).toMatchObject({name:"保持太郎",notes:"備考メモ",age:"30"});
  });
  it("入力不備(電話番号・同意)でも入力値を返し、満席は分かりやすいメッセージで返す",async()=>{
    const bad=await call(()=>reg.registerParticipant({},apply(eventId,{phone:"abc",name:"不備花子"})));
    const s=bad.value as {errors?:Record<string,string[]>;values?:Record<string,string>};
    expect(s.errors?.phone).toBeTruthy();expect(s.values?.name).toBe("不備花子");
    expect((await call(()=>reg.registerParticipant({},apply(fullId)))).thrown).toMatch(/^REDIRECT:/);// 1枠
    const full=await call(()=>reg.registerParticipant({},apply(fullId,{name:"満席太郎"})));
    expect(full.thrown).toBeNull();
    expect((full.value as {message?:string;values?:Record<string,string>}).message).toContain("満席");
    expect((full.value as {values?:Record<string,string>}).values?.name).toBe("満席太郎");
    expect(await db.eventRegistration.count({where:{eventId:fullId}})).toBe(1);
  });

  it("管理者は決裁権者が未設定のイベントに直接指定でき、すぐに有効になる（監査ログあり）",async()=>{
    state.user=u.admin;
    const r=await call(()=>act.assignApproverDirect(eventId,form({newApproverId:u.staff.id,ack:"on",returnTo:"list"})));
    expect(r.thrown).toBe("REDIRECT:/approvers?notice=assigned");
    expect(await approvers()).toEqual([u.staff.id]);
    expect(await db.auditLog.count({where:{action:"APPROVER_ASSIGNED_DIRECT",entityId:eventId,actorId:u.admin.id}})).toBe(1);
  });
  it("すでに決裁権者がいるイベントへの直接指定は拒否される（交代は申請フロー）",async()=>{
    state.user=u.admin;
    const r=await call(()=>act.assignApproverDirect(eventId,form({newApproverId:u.staff2.id,ack:"on"})));
    expect(r.thrown).toBe(`REDIRECT:/events/${eventId}/approver?error=has_approver`);
    expect(await approvers()).toEqual([u.staff.id]);
  });
  it("管理者以外・参加者・無効アカウント・確認チェックなしは指定できない",async()=>{
    const id=await mkEvent("直接指定の拒否",10);
    for(const k of ["mgr","staff"]){state.user=u[k];expect((await call(()=>act.assignApproverDirect(id,form({newApproverId:u.staff2.id,ack:"on"})))).thrown).toBe("FORBIDDEN")}
    state.user=u.admin;
    expect((await call(()=>act.assignApproverDirect(id,form({newApproverId:u.part.id,ack:"on"})))).thrown).toBe(`REDIRECT:/events/${id}/approver?error=invalid_new`);
    expect((await call(()=>act.assignApproverDirect(id,form({newApproverId:u.off.id,ack:"on"})))).thrown).toBe(`REDIRECT:/events/${id}/approver?error=invalid_new`);
    expect((await call(()=>act.assignApproverDirect(id,form({newApproverId:u.staff2.id})))).thrown).toBe(`REDIRECT:/events/${id}/approver?error=invalid`);
    expect(await approvers(id)).toEqual([]);
  });
  it("確認待ちの変更申請があるイベントには直接指定できない（二重指定の防止）",async()=>{
    const id=await mkEvent("申請中",10);state.user=u.admin;
    expect((await call(()=>act.requestApproverChange(id,form({newApproverId:u.staff.id,reason:"初回の指定"})))).thrown).toBe(`REDIRECT:/events/${id}/approver?notice=requested`);
    expect((await call(()=>act.assignApproverDirect(id,form({newApproverId:u.staff2.id,ack:"on"})))).thrown).toBe(`REDIRECT:/events/${id}/approver?error=already_pending`);
    expect(await approvers(id)).toEqual([]);
  });
});
