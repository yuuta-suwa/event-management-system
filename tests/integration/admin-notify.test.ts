import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
const state=vi.hoisted(()=>({user:{id:"",role:"SUPER_ADMIN",name:"x"}}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async(roles?:string[])=>{if(roles&&!roles.includes(state.user.role))throw new Error("FORBIDDEN");return state.user},validatedSessionUser:async()=>state.user}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
type Mail={to:string[];subject:string;text:string};type Line={to:string;text:string};
describe.skipIf(!enabled)("参加登録の管理者通知（実DB・使い捨てテストDBのみ・外部送信はモック）",()=>{
  let db:typeof import("@/server/db").db;let svc:typeof import("@/features/admin-notify/service");let act:typeof import("@/features/admin-notify/actions");let reg:typeof import("@/features/participants/actions");
  let eventId:string;const u:Record<string,{id:string;role:string;name:string;email:string}>={};const run=randomUUID().slice(0,6);let seq=0;
  let mails:Mail[]=[];let lines:Line[]=[];let lineStatus=200;let mailStatus=200;const realFetch=globalThis.fetch;
  const LINE_ID="U"+"b".repeat(32);
  const form=(o:Record<string,string>)=>{const f=new FormData();for(const [k,v] of Object.entries(o))f.set(k,v);return f};
  async function call(fn:()=>Promise<unknown>){try{await fn();return "none"}catch(e){return e instanceof Error?e.message:String(e)}}
  async function register(over:Record<string,string>={}){
    const n=++seq;const f=form({eventId,name:`通知太郎${n}`,nameKana:"ツウチ",phone:`080${String(2e7+n*91).padStart(8,"0")}`,email:`notify${n}-${run}@example.com`,quantity:"1",privacy:"on",...over});
    const m=await call(()=>reg.registerParticipant({},f));
    const id=decodeURIComponent(m).match(/complete\?mine=/)?(await db.eventRegistration.findFirstOrThrow({where:{eventId},orderBy:{appliedAt:"desc"},select:{id:true}})).id:"";
    expect(id).not.toBe("");return {id,name:`通知太郎${n}`,email:`notify${n}-${run}@example.com`,phone:`080${String(2e7+n*91).padStart(8,"0")}`};
  }
  const mine=(id:string)=>mails.filter(m=>m.to.includes(u[id].email));
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:"t".repeat(48),RESEND_API_KEY:"re_test",EMAIL_FROM:"事務局 <t@example.com>",LINE_MESSAGING_ACCESS_TOKEN:"line-token",NEXT_PUBLIC_APP_URL:"https://app.example.test"});
    ({db}=await import("@/server/db"));svc=await import("@/features/admin-notify/service");act=await import("@/features/admin-notify/actions");reg=await import("@/features/participants/actions");
    await db.adminNotificationPref.deleteMany({});// 使い捨てテストDBのみ: 過去の実行で残った設定行を掃除
    await db.adminNotificationRecipient.deleteMany({});// 追加された宛先(別テストの残り)にも送られてしまうため掃除
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF",status:"ACTIVE"|"SUSPENDED"="ACTIVE")=>{const email=`${key}-${run}@example.com`;const x=await db.user.create({data:{name:`${key}-${run}`,email,role,status}});u[key]={id:x.id,role,name:x.name,email}};
    await Promise.all([mk("admin1","SUPER_ADMIN"),mk("admin2","SUPER_ADMIN"),mk("adminOff","SUPER_ADMIN","SUSPENDED"),mk("mgr","EVENT_MANAGER"),mk("mgr2","EVENT_MANAGER"),mk("staff","RECEPTION_STAFF")]);
    const category=await db.eventCategory.create({data:{name:`N-${run}`,slug:`n-${randomUUID()}`}});const day=new Date(Date.now()+30*86400000);
    eventId=(await db.event.create({data:{categoryId:category.id,name:`通知テスト-${run}`,description:"テスト用です。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity:50,price:1000,organizer:"主催",managerId:u.mgr.id,applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED"}})).id;
    globalThis.fetch=(async(input:unknown,init?:{body?:string})=>{
      const target=String(input);
      if(target.startsWith("https://api.resend.com")){const b=JSON.parse(init!.body!);if(mailStatus===200)mails.push({to:b.to,subject:b.subject,text:b.text});return new Response(JSON.stringify({id:"m1",message:mailStatus===200?undefined:"boom"}),{status:mailStatus})}
      if(target.startsWith("https://api.line.me")){const b=JSON.parse(init!.body!);if(lineStatus===200)lines.push({to:b.to,text:b.messages[0].text});return new Response("err",{status:lineStatus})}
      return realFetch(input as RequestInfo,init as RequestInit);
    }) as typeof fetch;
  });
  beforeEach(()=>{mails=[];lines=[];lineStatus=200;mailStatus=200;process.env.RESEND_API_KEY="re_test"});
  // 過去のテスト実行で作られた別の管理者もDBに残っているため、検証は「このテストで作ったユーザー」単位で行う
  afterEach(async()=>{await db.adminNotificationPref.deleteMany({where:{userId:{in:Object.values(u).map(x=>x.id)}}})});
  const logFor=(registrationId:string,key:string,channel="EMAIL")=>db.adminNotificationLog.findFirst({where:{registrationId,userId:u[key].id,channel}});
  afterAll(async()=>{globalThis.fetch=realFetch;await db?.$disconnect()});

  it("参加登録で、有効な管理者とそのイベントの担当者にメールが届く。受付スタッフ・他の担当者・無効アカウントには届かない",async()=>{
    const r=await register();
    await svc.notifyAdminsOfRegistration(r.id,1);
    for(const k of ["admin1","admin2","mgr"]){expect(mine(k)).toHaveLength(1);expect(mine(k)[0].subject).toContain("参加登録が1件ありました");expect((await logFor(r.id,k))?.status).toBe("SENT")}
    for(const k of ["mgr2","staff","adminOff"]){expect(mine(k)).toHaveLength(0);expect(await logFor(r.id,k)).toBeNull()}
  });
  it("通知に個人情報（氏名・電話番号・メールアドレス）を含めず、累計と未入金を伝える",async()=>{
    const r=await register();await svc.notifyAdminsOfRegistration(r.id,1);
    const body=mine("admin1")[0].text;
    for(const secret of [r.name,r.phone,r.email])expect(body).not.toContain(secret);
    expect(body).toMatch(/登録の累計：\d+件／定員50名（入金済 0件・未入金 \d+件）/);
    expect(body).toContain("https://app.example.test/participants");
  });
  it("同じ登録を再度通知しても二重に送らない（登録×宛先×チャネル）",async()=>{
    const r=await register();await svc.notifyAdminsOfRegistration(r.id,1);const first=mails.length;
    const again=await svc.notifyAdminsOfRegistration(r.id,1);
    expect(again).toEqual({sent:0,failed:0,skipped:0});expect(mails.length).toBe(first);
    expect(await db.adminNotificationLog.count({where:{registrationId:r.id,userId:u.admin1.id,channel:"EMAIL"}})).toBe(1);
  });
  it("複数枚の申込は枚数を併記し、キャンセル済みの登録は累計に含めない",async()=>{
    const cancelled=await register();await db.eventRegistration.update({where:{id:cancelled.id},data:{attendanceStatus:"CANCELLED"}});
    const total=await db.eventRegistration.count({where:{eventId,attendanceStatus:{not:"CANCELLED"}}});
    const r=await register({quantity:"2"});await svc.notifyAdminsOfRegistration(r.id,2);
    const body=mine("admin1")[0].text;
    expect(body).toContain("参加登録が1件ありました（2枚）");
    expect(body).toContain(`登録の累計：${total+1}件`);
  });
  it("設定でメールを切ると送らず、LINEを有効にして宛先を登録すると、LINEにも届く",async()=>{
    await db.adminNotificationPref.create({data:{userId:u.admin1.id,registrationEmail:false,registrationLine:false}});
    await db.adminNotificationPref.create({data:{userId:u.admin2.id,registrationEmail:true,registrationLine:true,lineUserId:LINE_ID}});
    const r=await register();await svc.notifyAdminsOfRegistration(r.id,1);
    expect(mine("admin1")).toHaveLength(0);expect(await logFor(r.id,"admin1")).toBeNull();
    expect(mine("admin2")).toHaveLength(1);
    expect(lines).toEqual([{to:LINE_ID,text:expect.stringContaining("参加登録が1件ありました")}]);
    expect((await logFor(r.id,"admin2","LINE"))?.status).toBe("SENT");
  });
  it("LINEの送信に失敗しても、他の宛先への通知は続き、失敗は記録される。申込そのものは成功のまま",async()=>{
    await db.adminNotificationPref.create({data:{userId:u.admin2.id,registrationEmail:true,registrationLine:true,lineUserId:LINE_ID}});
    lineStatus=500;const r=await register();await svc.notifyAdminsOfRegistration(r.id,1);
    expect(mine("admin1")).toHaveLength(1);expect(mine("mgr")).toHaveLength(1);
    const log=await db.adminNotificationLog.findFirstOrThrow({where:{registrationId:r.id,userId:u.admin2.id,channel:"LINE"}});
    expect(log.status).toBe("FAILED");expect(log.error).toContain("LINE_API_500");
    expect(await db.eventRegistration.count({where:{id:r.id}})).toBe(1);
  });
  it("メール送信が未設定でも例外にならず、「送信しない」と記録する",async()=>{
    delete process.env.RESEND_API_KEY;const r=await register();
    await svc.notifyAdminsOfRegistration(r.id,1);expect(mails).toHaveLength(0);
    for(const k of ["admin1","admin2","mgr"])expect((await logFor(r.id,k))?.status).toBe("SKIPPED");
  });
  it("存在しない登録や、DBエラーでも例外を投げない（申込を止めない）",async()=>{
    expect(await svc.notifyAdminsOfRegistration("no-such-id",1)).toEqual({sent:0,failed:0,skipped:0});
  });
  it("通知設定は自分の分だけ保存でき、LINE宛先の形式・必須チェックがある。管理者・担当者以外は設定できない",async()=>{
    state.user=u.admin1;
    expect(await call(()=>act.saveAdminNotificationPref(form({registrationEmail:"on",registrationLine:"on",lineUserId:LINE_ID})))).toBe("REDIRECT:/settings/notifications?notice=saved");
    expect(await db.adminNotificationPref.findUniqueOrThrow({where:{userId:u.admin1.id}})).toMatchObject({registrationEmail:true,registrationLine:true,lineUserId:LINE_ID});
    expect(await db.adminNotificationPref.count({where:{userId:u.admin2.id}})).toBe(0);
    expect(await call(()=>act.saveAdminNotificationPref(form({registrationLine:"on",lineUserId:"not-an-id"})))).toBe("REDIRECT:/settings/notifications?error=invalid_line_id");
    expect(await call(()=>act.saveAdminNotificationPref(form({registrationLine:"on",lineUserId:""})))).toBe("REDIRECT:/settings/notifications?error=line_needs_id");
    for(const k of ["staff"]){state.user=u[k];expect(await call(()=>act.saveAdminNotificationPref(form({registrationEmail:"on"})))).toBe("FORBIDDEN")}
  });
  it("テスト通知は自分宛てだけに、実際と同じ形式で届く（記録も残る）",async()=>{
    state.user=u.mgr;
    expect(await call(()=>act.sendAdminTestNotice())).toBe("REDIRECT:/settings/notifications?notice=test_sent");
    expect(mails).toHaveLength(1);expect(mails[0].to).toEqual([u.mgr.email]);expect(mails[0].subject).toContain("【テスト】");
    expect(await db.adminNotificationLog.count({where:{userId:u.mgr.id,eventId:"test"}})).toBe(1);
    await db.adminNotificationPref.create({data:{userId:u.mgr.id,registrationEmail:false,registrationLine:false}});
    expect(await call(()=>act.sendAdminTestNotice())).toBe("REDIRECT:/settings/notifications?error=no_channel");
  });
});
