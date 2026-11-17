import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {randomBytes,randomUUID} from "node:crypto";
const state=vi.hoisted(()=>({user:{id:"",role:"SUPER_ADMIN",name:"x"}}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async(roles?:string[])=>{if(roles&&!roles.includes(state.user.role))throw new Error("FORBIDDEN");return state.user},validatedSessionUser:async()=>state.user}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
type Line={to:string;text:string};
describe.skipIf(!enabled)("通知の宛先の追加（LINE連携済みの参加者を、管理者が全イベントの通知先に追加）（実DB・使い捨てテストDBのみ・LINE送信はモック）",()=>{
  let db:typeof import("@/server/db").db;let svc:typeof import("@/features/admin-notify/service");let act:typeof import("@/features/admin-notify/recipient-actions");
  const run=randomUUID().slice(0,6);const lid=()=>"U"+randomBytes(16).toString("hex");
  const u:Record<string,{id:string;role:string;name:string}>={};const p:Record<string,{id:string;lineUserId:string|null}>={};
  let evA:string,evB:string,seq=0;let lines:Line[]=[];let lineStatus=200;const realFetch=globalThis.fetch;
  const form=(o:Record<string,string>)=>{const f=new FormData();for(const [k,v] of Object.entries(o))f.set(k,v);return f};
  async function call(fn:()=>Promise<unknown>){try{await fn();return "none"}catch(e){return e instanceof Error?e.message:String(e)}}
  async function mkEvent(name:string,managerId:string){
    const category=await db.eventCategory.upsert({where:{slug:`rc-${run}`},update:{},create:{name:`RC-${run}`,slug:`rc-${run}`}});const day=new Date(Date.now()+30*86400000);
    return (await db.event.create({data:{categoryId:category.id,name:`${name}-${run}`,description:"テスト用です。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity:50,price:1000,organizer:"主催",managerId,applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED"}})).id;
  }
  async function mkParticipant(key:string,linked:boolean){
    const n=++seq;const lineUserId=linked?lid():null;
    const x=await db.participant.create({data:{name:`${key}-${run}`,nameKana:"ツウチ",phone:`090${String(5e7+n*61).padStart(8,"0")}`,email:`rc${n}-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase(),lineUserId,lineConnected:linked}});
    p[key]={id:x.id,lineUserId};
  }
  /** 申込を1件作る(登録の作成だけ。通知は各テストで直接呼ぶ) */
  async function registration(eventId:string){
    const n=++seq;const x=await db.participant.create({data:{name:`申込者${n}-${run}`,nameKana:"モウシコミ",phone:`080${String(6e7+n*43).padStart(8,"0")}`,email:`reg${n}-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}});
    const t=await db.ticket.create({data:{eventId,participantId:x.id,ticketNumber:`RC-${run}-${n}`,qrTokenHash:randomUUID()}});
    const r=await db.eventRegistration.create({data:{eventId,participantId:x.id,ticketId:t.id,applicationSource:"WEB"}});
    return {id:r.id,name:x.name,email:x.email,phone:x.phone};
  }
  const to=(id:string|null)=>lines.filter(l=>l.to===id);
  const recipientOf=(key:string)=>db.adminNotificationRecipient.findUnique({where:{participantId:p[key].id}});
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:"t".repeat(48),LINE_MESSAGING_ACCESS_TOKEN:"line-token",NEXT_PUBLIC_APP_URL:"https://app.example.test"});delete process.env.RESEND_API_KEY;
    ({db}=await import("@/server/db"));svc=await import("@/features/admin-notify/service");act=await import("@/features/admin-notify/recipient-actions");
    await db.adminNotificationRecipient.deleteMany({});await db.adminNotificationPref.deleteMany({});// 使い捨てテストDBのみ: 過去の実行の残りを掃除
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER")=>{const x=await db.user.create({data:{name:`${key}-${run}`,email:`${key}-${run}@example.com`,role}});u[key]={id:x.id,role,name:x.name}};
    await Promise.all([mk("admin","SUPER_ADMIN"),mk("mgr","EVENT_MANAGER")]);
    await Promise.all([mkParticipant("okada",true),mkParticipant("sato",true),mkParticipant("unlinked",false)]);
    evA=await mkEvent("通知宛先A",u.mgr.id);evB=await mkEvent("通知宛先B",u.mgr.id);
    globalThis.fetch=(async(input:unknown,init?:{body?:string})=>{
      if(String(input).startsWith("https://api.line.me")){const b=JSON.parse(init!.body!);if(lineStatus===200)lines.push({to:b.to,text:b.messages[0].text});return new Response("err",{status:lineStatus})}
      return realFetch(input as RequestInfo,init as RequestInit);
    }) as typeof fetch;
  });
  beforeEach(()=>{lines=[];lineStatus=200;state.user=u.admin});
  afterAll(async()=>{globalThis.fetch=realFetch;await db?.adminNotificationRecipient.deleteMany({});await db?.$disconnect()});

  it("管理者だけが、LINE連携済みの参加者を宛先に追加できる。未連携の人・二重追加・担当者による追加は拒否される",async()=>{
    state.user=u.mgr;expect(await call(()=>act.addNotificationRecipient(form({participantId:p.okada.id})))).toBe("FORBIDDEN");
    state.user=u.admin;
    expect(await call(()=>act.addNotificationRecipient(form({participantId:p.unlinked.id})))).toBe("REDIRECT:/settings/notifications/recipients?error=not_linked");
    expect(await call(()=>act.addNotificationRecipient(form({participantId:"nope"})))).toBe("REDIRECT:/settings/notifications/recipients?error=not_found");
    expect(await call(()=>act.addNotificationRecipient(form({participantId:p.okada.id})))).toBe("REDIRECT:/settings/notifications/recipients?notice=added");
    expect(await call(()=>act.addNotificationRecipient(form({participantId:p.okada.id})))).toBe("REDIRECT:/settings/notifications/recipients?error=already");
    expect(await recipientOf("okada")).toMatchObject({active:true,addedBy:u.admin.id});
    expect(await recipientOf("unlinked")).toBeNull();
    expect(await db.auditLog.count({where:{action:"ADMIN_NOTIFICATION_RECIPIENT_ADDED",entityId:p.okada.id}})).toBe(1);
  });
  it("追加した人のLINEに、全イベントの参加登録が通知される（個人情報は含まない）",async()=>{
    for(const ev of [evA,evB]){
      const r=await registration(ev);await svc.notifyAdminsOfRegistration(r.id,1);
      const got=to(p.okada.lineUserId).at(-1)!;
      expect(got.text).toContain("参加登録が1件ありました");
      for(const secret of [r.name,r.email,r.phone])expect(got.text).not.toContain(secret);
    }
    expect(to(p.okada.lineUserId)).toHaveLength(2);
    expect(to(p.sato.lineUserId)).toHaveLength(0);// 追加していない人には届かない
  });
  it("同じ登録を再度通知しても、追加した人へは二重に送らない",async()=>{
    const r=await registration(evA);await svc.notifyAdminsOfRegistration(r.id,1);await svc.notifyAdminsOfRegistration(r.id,1);
    expect(to(p.okada.lineUserId)).toHaveLength(1);
  });
  it("一時停止すると届かず、再開すると届く。削除すると届かない",async()=>{
    const id=(await recipientOf("okada"))!.id;
    expect(await call(()=>act.setNotificationRecipientActive(false,form({id})))).toBe("REDIRECT:/settings/notifications/recipients?notice=paused");
    await svc.notifyAdminsOfRegistration((await registration(evA)).id,1);expect(lines).toHaveLength(0);
    await call(()=>act.setNotificationRecipientActive(true,form({id})));
    await svc.notifyAdminsOfRegistration((await registration(evA)).id,1);expect(to(p.okada.lineUserId)).toHaveLength(1);
    lines=[];await call(()=>act.removeNotificationRecipient(form({id})));
    await svc.notifyAdminsOfRegistration((await registration(evA)).id,1);expect(lines).toHaveLength(0);
    expect(await db.participant.count({where:{id:p.okada.id}})).toBe(1);// 参加者の情報は消えない
    await call(()=>act.addNotificationRecipient(form({participantId:p.okada.id})));
  });
  it("宛先のLINEは送信時の現在の連携から引く。連携を変えれば新しい方へ、解除すれば送らず「送れず」と記録する",async()=>{
    const old=p.okada.lineUserId!;const next=lid();
    await db.participant.update({where:{id:p.okada.id},data:{lineUserId:next}});
    await svc.notifyAdminsOfRegistration((await registration(evA)).id,1);
    expect(to(next)).toHaveLength(1);expect(to(old)).toHaveLength(0);
    await db.participant.update({where:{id:p.okada.id},data:{lineConnected:false}});lines=[];
    const r=await registration(evA);await svc.notifyAdminsOfRegistration(r.id,1);
    expect(lines).toHaveLength(0);
    const rid=(await recipientOf("okada"))!.id;
    expect((await db.adminNotificationLog.findFirstOrThrow({where:{registrationId:r.id,userId:`recipient:${rid}`}})).status).toBe("SKIPPED");
    await db.participant.update({where:{id:p.okada.id},data:{lineUserId:old,lineConnected:true}});
  });
  it("管理者本人の通知設定と同じLINEの人を追加しても、二重に送らない",async()=>{
    await call(()=>act.addNotificationRecipient(form({participantId:p.sato.id})));
    await db.adminNotificationPref.create({data:{userId:u.admin.id,registrationEmail:false,registrationLine:true,lineUserId:p.sato.lineUserId}});
    const r=await registration(evA);await svc.notifyAdminsOfRegistration(r.id,1);await svc.notifyAdminsOfRegistration(r.id,1);
    expect(to(p.sato.lineUserId)).toHaveLength(1);
    await db.adminNotificationPref.deleteMany({where:{userId:u.admin.id}});
    const satoId=(await recipientOf("sato"))!.id;await call(()=>act.removeNotificationRecipient(form({id:satoId})));
  });
  it("テスト通知は、選んだ宛先にだけ「【テスト】」付きで届く。送信に失敗しても他の宛先への通知は止まらず、失敗が記録される",async()=>{
    const id=(await recipientOf("okada"))!.id;
    expect(await call(()=>act.testNotificationRecipient(form({id})))).toBe("REDIRECT:/settings/notifications/recipients?notice=test_sent");
    expect(lines).toHaveLength(1);expect(lines[0].to).toBe(p.okada.lineUserId);expect(lines[0].text).toContain("【テスト】");
    lineStatus=500;const r=await registration(evA);const out=await svc.notifyAdminsOfRegistration(r.id,1);
    expect(out.failed).toBeGreaterThanOrEqual(1);
    const log=await db.adminNotificationLog.findFirstOrThrow({where:{registrationId:r.id,userId:`recipient:${id}`}});
    expect(log.status).toBe("FAILED");expect(log.error).toContain("LINE_API_500");
    expect(await db.eventRegistration.count({where:{id:r.id}})).toBe(1);
  });
});
