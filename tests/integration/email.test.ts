import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async()=>{throw new Error("unused")},validatedSessionUser:async()=>null}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
type Sent={to:string[];subject:string;text:string;html:string;attachments?:{filename:string;content:string}[]};
describe.skipIf(!enabled)("QRチケットのメール配信（実DB・使い捨てテストDBのみ・外部送信はモック）",()=>{
  let db:typeof import("@/server/db").db;let svc:typeof import("@/features/email/service");let tk:typeof import("@/features/tickets/token");let rc:typeof import("@/features/checkins/reception-code");
  let eventId:string,mgrId:string;const secret="t".repeat(48);const run=randomUUID().slice(0,6);let seq=0;
  let sent:Sent[]=[];let mode:"ok"|"422"|"500"=["ok"][0] as "ok";const realFetch=globalThis.fetch;
  async function mk(opts:{paid?:boolean;claimed?:boolean;phone?:string}={}){
    const n=++seq;
    const p=await db.participant.create({data:{name:`受取${n}-${run}`,nameKana:"ウケトリ",phone:opts.phone??`080-5555-${String(1000+n)}`,email:`mail${n}-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}});
    const t=await db.ticket.create({data:{eventId,participantId:p.id,ticketNumber:`M-${run}-${n}`,qrTokenHash:randomUUID(),status:opts.paid===false?"PROVISIONAL":"ACTIVE",paymentStatus:opts.paid===false?"UNPAID":"PAID",claimed:opts.claimed??true}});
    await db.ticket.update({where:{id:t.id},data:{qrTokenHash:tk.hashTicketToken(tk.issueTicketToken(t.id,1,secret))}});
    await db.eventRegistration.create({data:{eventId,participantId:p.id,ticketId:t.id,attendanceStatus:"EXPECTED",applicationSource:"WEB"}});
    return {p,t};
  }
  const logsOf=(ticketId:string)=>db.emailLog.findMany({where:{ticketId},orderBy:{createdAt:"asc"}});
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:secret,NEXT_PUBLIC_APP_URL:"https://app.example.com",RESEND_API_KEY:"re_test",EMAIL_FROM:"事務局 <tickets@example.com>"});
    ({db}=await import("@/server/db"));svc=await import("@/features/email/service");tk=await import("@/features/tickets/token");rc=await import("@/features/checkins/reception-code");
    const mgr=await db.user.create({data:{name:`m-${run}`,email:`m-${run}@example.com`,role:"EVENT_MANAGER"}});
    mgrId=mgr.id;
    const category=await db.eventCategory.create({data:{name:`E-${run}`,slug:`e-${randomUUID()}`}});
    const day=new Date(Date.now()+10*86400000);
    eventId=(await db.event.create({data:{categoryId:category.id,name:"メール配信テスト",description:"テスト用イベントです。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"テスト会場",address:"東京都",capacity:50,price:5000,organizer:"テスト主催",managerId:mgr.id,applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED"}})).id;
  });
  beforeEach(()=>{sent=[];mode="ok";globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{if(String(input)!=="https://api.resend.com/emails")return realFetch(input,init);sent.push(JSON.parse(String(init?.body)));return mode==="ok"?new Response(JSON.stringify({id:"msg_1"}),{status:200}):mode==="422"?new Response(JSON.stringify({message:"domain not verified"}),{status:422}):new Response("{}",{status:500})}) as typeof fetch});
  afterAll(async()=>{globalThis.fetch=realFetch;await db?.$disconnect()});

  it("T17 入金確認後、保有者へQRチケット・受付コード・イベント情報つきのメールが届く。個人情報は載せない",async()=>{
    const {t,p}=await mk({phone:"080-1234-9876"});
    expect(await svc.queueTicketEmail(db,{kind:"TICKET_ACTIVATED",ticketId:t.id})).toBe(true);
    const [log]=await logsOf(t.id);expect(await svc.deliverEmail(log.id)).toBe("sent");
    expect(sent).toHaveLength(1);const m=sent[0];
    expect(m.to).toEqual([p.email]);expect(m.subject).toContain("メール配信テスト");
    const code=(await rc.ensureReceptionCode(t.id))!;
    for(const needle of ["メール配信テスト","テスト会場",t.ticketNumber,p.name,`${code.slice(0,3)} ${code.slice(3)}`,"https://app.example.com/ticket/evt1.","https://app.example.com/my/reg1."])expect(m.text).toContain(needle);
    expect(m.text).not.toContain("1234-9876");expect(m.text).not.toContain(p.email);expect(m.html).not.toContain("1234-9876");
    expect(m.attachments).toHaveLength(1);expect(m.attachments![0].filename).toBe(`ticket-${t.ticketNumber}.png`);expect(Buffer.from(m.attachments![0].content,"base64").subarray(1,4).toString()).toBe("PNG");
    expect(await logsOf(t.id)).toMatchObject([{status:"SENT",providerMessageId:"msg_1",attempt:1}]);
    // 同じ保有者・同じQR版数・同じ種別は二重送信しない
    expect(await svc.queueTicketEmail(db,{kind:"TICKET_ACTIVATED",ticketId:t.id})).toBe(false);expect(await logsOf(t.id)).toHaveLength(1);
  });
  it("T18 5枚購入: 受取人が未定のチケットは誰にも送らない。受取人が決まったら本人のアドレスへ個別に送る",async()=>{
    const buyer=await mk();
    const loose=await Promise.all([1,2,3,4].map(()=>mk({claimed:false})));
    for(const l of loose)expect(await svc.queueTicketEmail(db,{kind:"TICKET_ACTIVATED",ticketId:l.t.id})).toBe(false);
    expect(await svc.queueTicketEmail(db,{kind:"TICKET_ACTIVATED",ticketId:buyer.t.id})).toBe(true);
    for(const l of loose)expect(await logsOf(l.t.id)).toHaveLength(0);
    // 受取人が登録したので(claimed=true)そのアドレスへ
    await db.ticket.update({where:{id:loose[0].t.id},data:{claimed:true}});
    expect(await svc.queueTicketEmail(db,{kind:"TRANSFER_RECEIVED",ticketId:loose[0].t.id})).toBe(true);
    const [l0]=await logsOf(loose[0].t.id);expect(l0.toEmail).toBe(loose[0].p.email.toLowerCase());
    await svc.deliverEmail(l0.id);expect(sent.at(-1)!.to).toEqual([loose[0].p.email.toLowerCase()]);
  });
  it("T21 譲渡後: 旧保有者宛ての未送信メールは送らず、旧QRは添付されない。新保有者には新しいQRが届く",async()=>{
    const old=await mk();const next=await mk();
    await svc.queueTicketEmail(db,{kind:"TICKET_ACTIVATED",ticketId:old.t.id});
    // 送信前に譲渡(claim/transferと同じ更新: 保有者変更・QR版数更新)
    const v2=tk.issueTicketToken(old.t.id,2,secret);
    await db.ticket.update({where:{id:old.t.id},data:{participantId:next.p.id,qrTokenVersion:2,qrTokenHash:tk.hashTicketToken(v2),receptionCode:null}});
    await db.eventRegistration.update({where:{ticketId:old.t.id},data:{participantId:next.p.id}}).catch(()=>{});
    const [oldLog]=await logsOf(old.t.id);expect(await svc.deliverEmail(oldLog.id)).toBe("skipped");
    expect(sent).toHaveLength(0);expect((await logsOf(old.t.id))[0].errorMessage).toContain("保有者が変更");
    expect(await svc.queueTicketEmail(db,{kind:"TRANSFER_RECEIVED",ticketId:old.t.id})).toBe(true);
    const logs=await logsOf(old.t.id);const fresh=logs.find(l=>l.kind==="TRANSFER_RECEIVED")!;
    expect(fresh.toEmail).toBe(next.p.email.toLowerCase());
    expect(await svc.deliverEmail(fresh.id)).toBe("sent");expect(sent[0].text).toContain(`/ticket/${v2}`);expect(sent[0].text).not.toContain(`${tk.issueTicketToken(old.t.id,1,secret)}`);
  });
  it("失効・取消・未入金のQRは送らない（サーバー側で送信直前に再確認）",async()=>{
    const cancelled=await mk();await svc.queueTicketEmail(db,{kind:"TICKET_ACTIVATED",ticketId:cancelled.t.id});
    await db.ticket.update({where:{id:cancelled.t.id},data:{status:"CANCELLED"}});
    expect(await svc.deliverEmail((await logsOf(cancelled.t.id))[0].id)).toBe("skipped");
    const unpaid=await mk({paid:false});await svc.queueTicketEmail(db,{kind:"TICKET_ACTIVATED",ticketId:unpaid.t.id});
    expect(await svc.deliverEmail((await logsOf(unpaid.t.id))[0].id)).toBe("skipped");
    // 手動再送でも、失効済みのQRハッシュ(ticketのhashと不一致)は添付されない
    const stale=await mk();await db.ticket.update({where:{id:stale.t.id},data:{qrTokenHash:`mismatch-${randomUUID()}`}});
    const r=await svc.resendTicketEmail(stale.t.id,{id:null});expect(r.ok).toBe(true);
    expect(sent).toHaveLength(1);expect(sent[0].attachments).toBeUndefined();expect(sent[0].text).not.toContain("/ticket/");expect(sent[0].text).not.toContain("▼ 受付コード");
    // 申込受付メールはQR・受付コードを含まない
    const reg=await mk({paid:false});await svc.queueTicketEmail(db,{kind:"REGISTRATION_COMPLETE",ticketId:reg.t.id});sent=[];
    expect(await svc.deliverEmail((await logsOf(reg.t.id))[0].id)).toBe("sent");expect(sent[0].text).not.toContain("/ticket/");expect(sent[0].attachments).toBeUndefined();expect(sent[0].text).toContain("/my/reg1.");
  });
  it("T19 送信失敗: 宛先不正などは失敗として記録、一時的な障害は3回まで再試行。T20 失敗後の再送ができる",async()=>{
    const a=await mk();await svc.queueTicketEmail(db,{kind:"TICKET_ACTIVATED",ticketId:a.t.id});mode="422";
    expect(await svc.deliverEmail((await logsOf(a.t.id))[0].id)).toBe("failed");
    expect(await logsOf(a.t.id)).toMatchObject([{status:"FAILED",attempt:1}]);expect((await logsOf(a.t.id))[0].errorMessage).toContain("422");
    const b=await mk();await svc.queueTicketEmail(db,{kind:"TICKET_ACTIVATED",ticketId:b.t.id});mode="500";const id=(await logsOf(b.t.id))[0].id;
    expect(await svc.deliverEmail(id)).toBe("retry");expect(await svc.deliverEmail(id)).toBe("retry");expect(await svc.deliverEmail(id)).toBe("failed");
    expect(await svc.deliverEmail(id)).toBeNull();// 終了済みは再実行されない
    expect(await logsOf(b.t.id)).toMatchObject([{status:"FAILED",attempt:3}]);
    mode="ok";sent=[];const again=await svc.retryFailedEmail(id,mgrId);expect(again).toMatchObject({ok:true,code:"sent"});expect(sent).toHaveLength(1);
    expect((await logsOf(b.t.id)).map(l=>l.kind)).toEqual(["TICKET_ACTIVATED","MANUAL_RESEND"]);
    expect(await db.auditLog.count({where:{action:"EMAIL_FAILED",entityId:id}})).toBeGreaterThan(0);
  });
  it("同時に送信処理が走っても1通しか送らない",async()=>{
    const a=await mk();await svc.queueTicketEmail(db,{kind:"TICKET_ACTIVATED",ticketId:a.t.id});const id=(await logsOf(a.t.id))[0].id;
    const results=await Promise.all([svc.deliverEmail(id),svc.deliverEmail(id),svc.deliverEmail(id)]);
    expect(results.filter(r=>r==="sent")).toHaveLength(1);expect(sent).toHaveLength(1);
  });
  it("再送は1チケット24時間に3回まで。送信サービス未設定のときは送らず『送信しない』と記録する",async()=>{
    const a=await mk();
    for(let i=0;i<3;i++)expect((await svc.resendTicketEmail(a.t.id,{id:null})).ok).toBe(true);
    expect(await svc.resendTicketEmail(a.t.id,{id:null})).toMatchObject({ok:false,code:"rate_limited"});expect(sent).toHaveLength(3);
    const b=await mk();const saved=process.env.RESEND_API_KEY;delete process.env.RESEND_API_KEY;sent=[];
    try{const r=await svc.resendTicketEmail(b.t.id,{id:null});expect(r).toMatchObject({ok:true,code:"skipped"});expect(sent).toHaveLength(0);expect((await logsOf(b.t.id))[0]).toMatchObject({status:"SKIPPED"})}finally{process.env.RESEND_API_KEY=saved}
    const loose=await mk({claimed:false});expect(await svc.resendTicketEmail(loose.t.id,{id:null})).toMatchObject({ok:false,code:"not_resendable"});
  });
});
