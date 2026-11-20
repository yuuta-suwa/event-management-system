import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {createHmac,randomUUID} from "node:crypto";
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async()=>{throw new Error("UNUSED_IN_TEST")}}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
const secret="t".repeat(48);const channelSecret="line-channel-secret";
type Call={url:string;body:string};
describe.skipIf(!enabled)("LINE自動連携（実DB・使い捨てテストDBのみ）",()=>{
  let db:typeof import("@/server/db").db;let webhook:typeof import("@/app/api/line/webhook/route");let startRoute:typeof import("@/app/api/line/login/start/route");let callbackRoute:typeof import("@/app/api/line/login/callback/route");
  let svc:typeof import("@/features/notifications/service");let reg:typeof import("@/features/participants/registration-token");let tok:typeof import("@/features/tickets/token");let selfActions:typeof import("@/features/participants/line-self-actions");
  const run=randomUUID().slice(0,6);let calls:Call[]=[];let eventId:string;
  const realFetch=globalThis.fetch;
  const post=(events:unknown[])=>{const body=JSON.stringify({events});return webhook.POST(new Request("http://localhost/api/line/webhook",{method:"POST",headers:{"x-line-signature":createHmac("sha256",channelSecret).update(body).digest("base64"),"content-type":"application/json"},body}))};
  const ev=(type:string,userId:string,extra:Record<string,unknown>={})=>({type,webhookEventId:randomUUID(),replyToken:`rt-${randomUUID()}`,source:{type:"user",userId},...extra});
  const text=(userId:string,t:string)=>ev("message",userId,{message:{type:"text",text:t}});
  const replies=()=>calls.filter(c=>c.url.endsWith("/message/reply")).map(c=>JSON.parse(c.body).messages[0].text as string);
  async function mkParticipant(key:string){return db.participant.create({data:{name:`${key} 花子`,nameKana:"ハナコ",phone:`080${String(Math.floor(Math.random()*1e8)).padStart(8,"0")}`,email:`${key}-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}})}
  async function mkRegistration(participantId:string,paid=true){const id=randomUUID();const t=await db.ticket.create({data:{id,eventId,participantId,ticketNumber:`L-${randomUUID().slice(0,8)}`,qrTokenHash:tok.hashTicketToken(tok.issueTicketToken(id,1,secret)),status:"ACTIVE",paymentStatus:paid?"PAID":"UNPAID"}});return db.eventRegistration.create({data:{eventId,participantId,ticketId:t.id,applicationSource:"WEB"}})}
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:secret,LINE_CHANNEL_SECRET:channelSecret,LINE_MESSAGING_ACCESS_TOKEN:"token",NEXT_PUBLIC_APP_URL:"https://app.example.com",LINE_LOGIN_CHANNEL_ID:"9999",LINE_LOGIN_CHANNEL_SECRET:"login-secret"});
    ({db}=await import("@/server/db"));webhook=await import("@/app/api/line/webhook/route");startRoute=await import("@/app/api/line/login/start/route");callbackRoute=await import("@/app/api/line/login/callback/route");svc=await import("@/features/notifications/service");reg=await import("@/features/participants/registration-token");tok=await import("@/features/tickets/token");selfActions=await import("@/features/participants/line-self-actions");
    const manager=await db.user.create({data:{name:"管理者",email:`m-${randomUUID()}@example.com`,role:"EVENT_MANAGER"}});
    const category=await db.eventCategory.create({data:{name:`LINE-${run}`,slug:`l-${randomUUID()}`}});
    const day=new Date(Date.now()+20*86400000);
    eventId=(await db.event.create({data:{categoryId:category.id,name:"LINE連携テスト",description:"テスト用イベントです。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity:50,price:1000,organizer:"主催",managerId:manager.id,applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED",lineNotifications:true}})).id;
  });
  beforeEach(()=>{calls=[];globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{const u=String(input);calls.push({url:u,body:String(init?.body??"")});return new Response(JSON.stringify({}),{status:200})}) as typeof fetch});
  afterAll(async()=>{globalThis.fetch=realFetch;await db?.$disconnect()});

  it("T13 友だち追加(follow)を検知して仮登録し、連携案内を返信する",async()=>{
    const uid=`U${run}follow1`;const r=await post([ev("follow",uid)]);expect(r.status).toBe(200);
    expect(await db.lineFriend.findUniqueOrThrow({where:{lineUserId:uid}})).toMatchObject({status:"FOLLOWING",matchStatus:"PENDING",participantId:null});
    expect(replies()).toHaveLength(1);expect(replies()[0]).toContain("マイチケット画面");expect(replies()[0]).not.toContain("8文字");
  });
  it("T16 同じWebhookが重複配信されても二重処理しない",async()=>{
    const uid=`U${run}dup1`;const e=ev("follow",uid);await post([e]);const first=await db.lineFriend.findUniqueOrThrow({where:{lineUserId:uid}});calls=[];
    await post([e]);await post([e]);
    expect(replies()).toHaveLength(0);expect((await db.lineFriend.findUniqueOrThrow({where:{lineUserId:uid}})).followedAt).toEqual(first.followedAt);expect(await db.lineWebhookEvent.count({where:{id:e.webhookEventId}})).toBe(1);
  });
  it("不正な署名は拒否する",async()=>{const r=await webhook.POST(new Request("http://localhost/api/line/webhook",{method:"POST",headers:{"x-line-signature":"bad"},body:JSON.stringify({events:[ev("follow",`U${run}x`)]})}));expect(r.status).toBe(401);expect(await db.lineFriend.count({where:{lineUserId:`U${run}x`}})).toBe(0)});
  it("T15 照合できないコードでは連携せず仮登録のまま",async()=>{
    const uid=`U${run}nomatch`;await post([ev("follow",uid)]);calls=[];const p=await mkParticipant("nm");
    await post([text(uid,"ZZZZ9999")]);
    expect(replies()[0]).toContain("見つかりません");expect((await db.participant.findUniqueOrThrow({where:{id:p.id}})).lineConnected).toBe(false);expect((await db.lineFriend.findUniqueOrThrow({where:{lineUserId:uid}})).matchStatus).toBe("PENDING");
    calls=[];await post([text(uid,"こんにちは、日程を教えてください")]);expect(replies()).toHaveLength(0);
  });
  it("T14 連携コードの照合で自動承認され、QRチケット通知がそのLINEへ届く(T17)",async()=>{
    const uid=`U${run}match1`;await post([ev("follow",uid)]);const p=await mkParticipant("m1");const r=await mkRegistration(p.id);calls=[];
    await post([text(uid,` ${p.lineLinkCode.toLowerCase()} `)]);
    expect(replies()[0]).toContain("連携が完了");
    expect(await db.participant.findUniqueOrThrow({where:{id:p.id}})).toMatchObject({lineUserId:uid,lineConnected:true});
    expect(await db.lineFriend.findUniqueOrThrow({where:{lineUserId:uid}})).toMatchObject({matchStatus:"MATCHED",participantId:p.id});
    expect(await db.auditLog.count({where:{action:"PARTICIPANT_LINE_LINKED",entityId:p.id}})).toBe(1);
    await db.notificationJob.create({data:{eventId,type:"TICKET",scheduledAt:new Date(Date.now()-1000),payload:{participantId:p.id}}});calls=[];
    await svc.processDueNotificationJobs(200);
    const push=calls.filter(c=>c.url.endsWith("/message/push")).map(c=>JSON.parse(c.body)).find(b=>b.to===uid);
    expect(push).toBeTruthy();expect(push.messages[0].text).toContain("/ticket/");expect(r.ticketId).toBeTruthy();
  });
  it("別のLINEアカウントによる連携コードの乗っ取りを防ぐ",async()=>{
    const owner=`U${run}owner`,thief=`U${run}thief`;await post([ev("follow",owner),ev("follow",thief)]);const p=await mkParticipant("tk");
    await post([text(owner,p.lineLinkCode)]);calls=[];await post([text(thief,p.lineLinkCode)]);
    expect(replies()[0]).toContain("すでに別のLINEアカウント");expect((await db.participant.findUniqueOrThrow({where:{id:p.id}})).lineUserId).toBe(owner);
  });
  it("1つのLINEアカウントを別の参加者へ二重連携できない",async()=>{
    const uid=`U${run}twice`;await post([ev("follow",uid)]);const a=await mkParticipant("ta"),b=await mkParticipant("tb");
    await post([text(uid,a.lineLinkCode)]);calls=[];await post([text(uid,b.lineLinkCode)]);
    expect(replies()[0]).toContain("すでに別のお申し込み");expect((await db.participant.findUniqueOrThrow({where:{id:b.id}})).lineConnected).toBe(false);
  });
  it("ブロック(unfollow)で通知停止・再追加で自動復帰する",async()=>{
    const uid=`U${run}block`;await post([ev("follow",uid)]);const p=await mkParticipant("bl");await mkRegistration(p.id);await post([text(uid,p.lineLinkCode)]);
    await post([ev("unfollow",uid)]);
    expect(await db.participant.findUniqueOrThrow({where:{id:p.id}})).toMatchObject({lineConnected:false,lineUserId:uid});expect((await db.lineFriend.findUniqueOrThrow({where:{lineUserId:uid}})).status).toBe("BLOCKED");
    await db.notificationJob.create({data:{eventId,type:"EVENT_EVE",scheduledAt:new Date(Date.now()-1000),payload:{participantId:p.id}}});calls=[];await svc.processDueNotificationJobs(200);
    expect(calls.filter(c=>c.url.endsWith("/message/push")&&JSON.parse(c.body).to===uid)).toHaveLength(0);
    calls=[];await post([ev("follow",uid)]);
    expect(replies()[0]).toContain("おかえりなさい");expect(await db.participant.findUniqueOrThrow({where:{id:p.id}})).toMatchObject({lineConnected:true,lineUserId:uid});
  });
  it("参加者本人がマイページから連携を解除できる",async()=>{
    const uid=`U${run}self`;await post([ev("follow",uid)]);const p=await mkParticipant("sf");const r=await mkRegistration(p.id);await post([text(uid,p.lineLinkCode)]);
    const f=new FormData();f.set("token",reg.issueRegistrationToken(r.id,secret));
    await expect(selfActions.unlinkMyLine(f)).rejects.toThrow("REDIRECT:/my/");
    expect(await db.participant.findUniqueOrThrow({where:{id:p.id}})).toMatchObject({lineConnected:false,lineUserId:null});expect(await db.lineFriend.findUniqueOrThrow({where:{lineUserId:uid}})).toMatchObject({matchStatus:"PENDING",participantId:null});
    const bad=new FormData();bad.set("token","reg1.forged.sig");await expect(selfActions.unlinkMyLine(bad)).rejects.toThrow("INVALID_TOKEN");
  });
  const recorder=(async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push({url:String(input),body:String(init?.body??"")});return new Response(JSON.stringify({}),{status:200})}) as typeof fetch;
  async function loginAs(participantId:string,uid:string,friendFlag:boolean|null){
    const r=(await db.eventRegistration.findFirst({where:{eventId,participantId}}))??await mkRegistration(participantId);const myToken=reg.issueRegistrationToken(r.id,secret);
    const start=await startRoute.GET(new Request(`https://app.example.com/api/line/login/start?token=${encodeURIComponent(myToken)}`));
    const auth=new URL(start.headers.get("location")!);expect(auth.searchParams.get("bot_prompt")).toBe("normal");
    const state=auth.searchParams.get("state")!;const nonce=auth.searchParams.get("nonce")!;
    globalThis.fetch=(async(input:RequestInfo|URL)=>{const u=String(input);if(u.endsWith("/token"))return new Response(JSON.stringify({id_token:"idt",access_token:"at"}),{status:200});if(u.endsWith("/verify"))return new Response(JSON.stringify({sub:uid,name:"ログイン太郎",nonce}),{status:200});if(u.endsWith("/friendship/v1/status"))return friendFlag===null?new Response("{}",{status:400}):new Response(JSON.stringify({friendFlag}),{status:200});return new Response("{}",{status:200})}) as typeof fetch;
    const res=await callbackRoute.GET(new Request(`https://app.example.com/api/line/login/callback?code=abc&state=${encodeURIComponent(state)}`,{headers:{cookie:`line_login_nonce=${nonce}`}}));
    globalThis.fetch=recorder;
    return {notice:new URL(res.headers.get("location")!).searchParams.get("notice"),state,nonce};
  }
  it("LINEログイン: 本人確認の上で自動連携し、不正なstate/nonceは拒否する",async()=>{
    const p=await mkParticipant("lg");const r=await mkRegistration(p.id);const myToken=reg.issueRegistrationToken(r.id,secret);const uid=`U${run}login`;
    const start=await startRoute.GET(new Request(`https://app.example.com/api/line/login/start?token=${encodeURIComponent(myToken)}`));
    expect(start.status).toBe(307);const auth=new URL(start.headers.get("location")!);expect(auth.host).toBe("access.line.me");
    const state=auth.searchParams.get("state")!;const nonce=auth.searchParams.get("nonce")!;const cookie=`line_login_nonce=${nonce}`;
    globalThis.fetch=(async(input:RequestInfo|URL)=>{const u=String(input);if(u.endsWith("/token"))return new Response(JSON.stringify({id_token:"idt",access_token:"at"}),{status:200});if(u.endsWith("/verify"))return new Response(JSON.stringify({sub:uid,name:"ログイン太郎",nonce}),{status:200});if(u.endsWith("/friendship/v1/status"))return new Response(JSON.stringify({friendFlag:true}),{status:200});return new Response("{}",{status:200})}) as typeof fetch;
    const cb=(s:string,c?:string)=>callbackRoute.GET(new Request(`https://app.example.com/api/line/login/callback?code=abc&state=${encodeURIComponent(s)}`,{headers:c?{cookie:c}:{}}));
    expect((await cb(state)).status).toBe(400);expect((await cb(state,"line_login_nonce=other")).status).toBe(400);expect((await cb(state.slice(0,-3)+"xxx",cookie)).status).toBe(400);
    expect((await db.participant.findUniqueOrThrow({where:{id:p.id}})).lineConnected).toBe(false);
    const ok=await cb(state,cookie);expect(ok.status).toBe(307);expect(ok.headers.get("location")).toContain("notice=line-linked");
    const after=await db.participant.findUniqueOrThrow({where:{id:p.id}});
    expect(after).toMatchObject({lineUserId:uid,lineConnected:true,lineFriendFlag:true});expect(after.lineVerifiedAt).not.toBeNull();
    expect(await db.lineFriend.findUniqueOrThrow({where:{lineUserId:uid}})).toMatchObject({matchStatus:"MATCHED",displayName:"ログイン太郎",status:"FOLLOWING"});
    expect((await startRoute.GET(new Request("https://app.example.com/api/line/login/start?token=reg1.bad.sig"))).status).toBe(400);
  });
  it("T10/T11 コード送信なしで連携: 友だち未追加ならログイン成功だけでは通知可能にならず、友だち追加で自動的に通知可能になる",async()=>{
    const {lineLinkState}=await import("@/features/line/link");
    const p=await mkParticipant("nf");const uid=`U${run}notfriend`;
    const r=await loginAs(p.id,uid,false);expect(r.notice).toBe("line-need-friend");
    const mid=await db.participant.findUniqueOrThrow({where:{id:p.id},include:{lineFriend:true}});
    expect(mid).toMatchObject({lineUserId:uid,lineConnected:false,lineFriendFlag:false});expect(mid.lineVerifiedAt).not.toBeNull();
    expect(lineLinkState({lineUserId:mid.lineUserId,lineConnected:mid.lineConnected,lineVerifiedAt:mid.lineVerifiedAt,friendStatus:mid.lineFriend?.status})).toMatchObject({stage:"LINKED_NOT_FRIEND",verified:true,linked:true,friend:false,notifiable:false});
    // 友だち追加(follow)で自動的に通知可能へ
    calls=[];await post([ev("follow",uid)]);
    const end=await db.participant.findUniqueOrThrow({where:{id:p.id},include:{lineFriend:true}});
    expect(end).toMatchObject({lineConnected:true,lineFriendFlag:true});
    expect(lineLinkState({lineUserId:end.lineUserId,lineConnected:end.lineConnected,lineVerifiedAt:end.lineVerifiedAt,friendStatus:end.lineFriend?.status})).toMatchObject({stage:"NOTIFIABLE",friend:true,notifiable:true});
    expect(replies()[0]).toContain("おかえりなさい");
  });
  it("T12 既に友だちの人は再ログインだけで通知可能になる／ブロック中は通知可能にならない(T15)",async()=>{
    const uid=`U${run}already`;await post([ev("follow",uid)]);const p=await mkParticipant("af");
    expect((await loginAs(p.id,uid,null)).notice).toBe("line-linked");
    expect(await db.participant.findUniqueOrThrow({where:{id:p.id}})).toMatchObject({lineConnected:true});
    // ブロック → 通知停止。ログインし直してもAPIが「友だちでない」と答える間は通知可能に戻らない
    await post([ev("unfollow",uid)]);
    expect(await db.participant.findUniqueOrThrow({where:{id:p.id}})).toMatchObject({lineConnected:false,lineFriendFlag:false});
    await loginAs(p.id,uid,false);
    const blocked=await db.participant.findUniqueOrThrow({where:{id:p.id},include:{lineFriend:true}});
    expect(blocked.lineConnected).toBe(false);expect(blocked.lineFriend?.status).toBe("BLOCKED");
    const {lineLinkState}=await import("@/features/line/link");
    expect(lineLinkState({lineUserId:blocked.lineUserId,lineConnected:false,lineVerifiedAt:blocked.lineVerifiedAt,friendStatus:blocked.lineFriend?.status}).stage).toBe("BLOCKED");
    await post([ev("follow",uid)]);expect((await db.participant.findUniqueOrThrow({where:{id:p.id}})).lineConnected).toBe(true);
  });
  it("T14 LINEログインでも1つのLINEアカウントを別の参加者へ二重連携できない",async()=>{
    const uid=`U${run}dupl`;const a=await mkParticipant("da");const b=await mkParticipant("db");
    expect((await loginAs(a.id,uid,true)).notice).toBe("line-linked");
    expect((await loginAs(b.id,uid,true)).notice).toBe("line-conflict");
    expect((await db.participant.findUniqueOrThrow({where:{id:b.id}})).lineUserId).toBeNull();
    expect((await loginAs(a.id,`U${run}other`,true)).notice).toBe("line-conflict");
    expect((await db.participant.findUniqueOrThrow({where:{id:a.id}})).lineUserId).toBe(uid);
  });
});
