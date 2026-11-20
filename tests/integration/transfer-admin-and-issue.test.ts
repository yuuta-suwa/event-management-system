import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
const state=vi.hoisted(()=>({user:{id:"",role:"SUPER_ADMIN",name:"x"}}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async(roles?:string[])=>{if(roles&&!roles.includes(state.user.role))throw new Error("FORBIDDEN");return state.user},validatedSessionUser:async()=>state.user}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
const secret="t".repeat(48);
describe.skipIf(!enabled)("管理者の譲渡の安定化・チケット発行/送付ボタン（実DB・使い捨てテストDBのみ・外部送信はモック）",()=>{
  let db:typeof import("@/server/db").db;let tr:typeof import("@/features/transfers/actions");let iss:typeof import("@/features/payments/issue-ticket-actions");let tk:typeof import("@/features/tickets/token");
  let eventId:string;const u:Record<string,{id:string;role:string;name:string}>={};const run=randomUUID().slice(0,6);let seq=0;
  let mails:{to:string[];subject:string;text:string;attachments?:unknown[]}[]=[];let mailStatus=200;const realFetch=globalThis.fetch;
  const as=(k:string)=>{state.user=u[k]};
  const form=(o:Record<string,string>)=>{const f=new FormData();for(const [k,v] of Object.entries(o))f.set(k,v);return f};
  const redirectOf=async(fn:()=>Promise<unknown>)=>{try{const r=await fn();return {redirect:null as string|null,result:r}}catch(e){const m=e instanceof Error?e.message:"";if(m.startsWith("REDIRECT:"))return {redirect:m.slice(9),result:undefined};throw e}};
  async function mkTicket(over:{paid?:boolean;claimed?:boolean;status?:"ACTIVE"|"PROVISIONAL"|"CANCELLED"}={}){
    const n=++seq;const p=await db.participant.create({data:{name:`保有者${n}-${run}`,nameKana:"ホユウシャ",phone:`070-${run.replace(/\D/g,"").padEnd(4,"1").slice(0,4)}-${String(1000+n)}`,email:`h${n}-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}});
    const paid=over.paid!==false;
    const t=await db.ticket.create({data:{eventId,participantId:p.id,ticketNumber:`TR-${run}-${n}`,qrTokenHash:"pending-"+randomUUID(),status:over.status??(paid?"ACTIVE":"PROVISIONAL"),paymentStatus:paid?"PAID":"UNPAID",claimed:over.claimed??true,issuedAt:paid?new Date():null}});
    const token=tk.issueTicketToken(t.id,1,secret);await db.ticket.update({where:{id:t.id},data:{qrTokenHash:tk.hashTicketToken(token)}});
    await db.eventRegistration.create({data:{eventId,participantId:p.id,ticketId:t.id,attendanceStatus:paid?"PAID":"APPLIED",applicationSource:"WEB"}});
    return {ticket:t,participant:p,token};
  }
  const input=(ticketId:string,over:Record<string,string>={})=>({ticketId,name:"新保有者",nameKana:"シンホユウシャ",phone:`080-${String(Math.floor(Math.random()*1e8)).padStart(8,"0").replace(/^(\d{4})(\d{4})$/,"$1-$2")}`,email:`new-${run}-${++seq}@example.com`,reason:"都合により",...over});
  const transfer=async(o:Record<string,string>)=>{const r=await redirectOf(()=>tr.transferTicket({},form(o)));return r.redirect?{ok:true as const,redirect:r.redirect}:{ok:false as const,state:r.result as {message?:string;errors?:Record<string,string>;values?:Record<string,string>}}};
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:secret,RESEND_API_KEY:"re_test",EMAIL_FROM:"事務局 <t@example.com>",NEXT_PUBLIC_APP_URL:"https://app.example.com"});
    ({db}=await import("@/server/db"));tr=await import("@/features/transfers/actions");iss=await import("@/features/payments/issue-ticket-actions");tk=await import("@/features/tickets/token");
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF")=>{const x=await db.user.create({data:{name:`${key}-${run}`,email:`${key}-${run}@example.com`,role}});u[key]={id:x.id,role,name:x.name}};
    await Promise.all([mk("admin","SUPER_ADMIN"),mk("mgr","EVENT_MANAGER"),mk("mgr2","EVENT_MANAGER"),mk("staff","RECEPTION_STAFF")]);
    const category=await db.eventCategory.create({data:{name:`TR-${run}`,slug:`tr-${randomUUID()}`}});const day=new Date(Date.now()+10*86400000);
    eventId=(await db.event.create({data:{categoryId:category.id,name:"譲渡・発行テスト",description:"テスト用イベントです。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity:100,price:5000,organizer:"主催",managerId:u.mgr.id,applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED"}})).id;
    globalThis.fetch=(async(input:unknown,init?:{body?:string})=>{const target=String(input);
      if(target.startsWith("https://api.resend.com")){const b=JSON.parse(init!.body!);if(mailStatus===200)mails.push({to:b.to,subject:b.subject,text:b.text,attachments:b.attachments});return new Response(JSON.stringify({id:"m1"}),{status:mailStatus})}
      return realFetch(input as RequestInfo,init as RequestInit)}) as typeof fetch;
  });
  afterAll(async()=>{globalThis.fetch=realFetch;await db?.$disconnect()});

  it("譲渡(管理者): 成功すると新QRに切り替わり、旧QRは失効し、新しい保有者にメールが届く。履歴が残る",async()=>{
    as("mgr");mails=[];const t=await mkTicket();const i=input(t.ticket.id);
    const r=await transfer(i);expect(r).toEqual({ok:true,redirect:"/transfers?notice=success"});
    const after=await db.ticket.findUniqueOrThrow({where:{id:t.ticket.id}});
    expect(after.qrTokenVersion).toBe(2);expect(after.qrTokenHash).not.toBe(tk.hashTicketToken(t.token));expect(after.paymentStatus).toBe("PAID");
    const np=await db.participant.findFirstOrThrow({where:{email:i.email}});expect(after.participantId).toBe(np.id);
    expect(await db.ticketTransfer.count({where:{ticketId:t.ticket.id,newParticipantId:np.id,source:"ADMIN"}})).toBe(1);
    const log=await db.emailLog.findFirstOrThrow({where:{ticketId:t.ticket.id,kind:"TRANSFER_RECEIVED"}});expect(log.toEmail).toBe(i.email);
    const outcome=await (await import("@/features/email/service")).deliverEmail(log.id);expect(outcome).toBe("sent");
    expect(mails.some(m=>m.to.includes(i.email))).toBe(true);
  });
  it("譲渡(管理者): 以前は画面が落ちていた入力ミス・重複を、日本語のメッセージで返す(入力値は保持・DBは変わらない)",async()=>{
    as("admin");
    const t=await mkTicket();
    // 理由が短い・電話が短い・メールが不正 → 例外ではなく項目ごとのエラー
    const bad=await transfer(input(t.ticket.id,{reason:"あ",phone:"12",email:"bad"}));
    expect(bad.ok).toBe(false);if(!bad.ok){expect(Object.keys(bad.state.errors!).sort()).toEqual(["email","phone","reason"]);expect(bad.state.values!.reason).toBe("あ")}
    // 現在の保有者と同じ人
    const same=await transfer(input(t.ticket.id,{email:t.participant.email,phone:t.participant.phone}));
    expect(same).toMatchObject({ok:false,state:{message:expect.stringContaining("同じ")}});
    // すでにこのイベントに別チケットで登録済みの人
    const other=await mkTicket();
    const dup=await transfer(input(t.ticket.id,{email:other.participant.email,phone:other.participant.phone}));
    expect(dup).toMatchObject({ok:false,state:{message:expect.stringContaining("すでに")}});
    // 受付済みは譲渡できない
    const used=await mkTicket();await db.checkin.create({data:{eventId,ticketId:used.ticket.id,participantId:used.participant.id,checkedInBy:u.staff.id,checkinType:"QR"}});
    expect(await transfer(input(used.ticket.id))).toMatchObject({ok:false,state:{message:expect.stringContaining("譲渡できません")}});
    // 存在しないチケット
    expect(await transfer(input("no-such-ticket"))).toMatchObject({ok:false,state:{message:expect.stringContaining("見つかりません")}});
    const stay=await db.ticket.findUniqueOrThrow({where:{id:t.ticket.id}});expect(stay.participantId).toBe(t.participant.id);expect(stay.qrTokenVersion).toBe(1);
    expect(await db.ticketTransfer.count({where:{ticketId:t.ticket.id}})).toBe(0);
  });
  it("譲渡(管理者): 全角・空白まじりの入力でも通る。担当外の管理者・受付スタッフは拒否される",async()=>{
    as("admin");const t=await mkTicket();
    const r=await transfer(input(t.ticket.id,{phone:`０９０－${String(Math.floor(Math.random()*9000)+1000).replace(/\d/g,d=>String.fromCharCode(0xff10+Number(d)))}－００１２`,email:` NEW-${run}-zen@EXAMPLE.com `,name:"　全角　太郎 "}));expect(r.ok).toBe(true);
    const p=await db.participant.findFirstOrThrow({where:{email:`new-${run}-zen@example.com`}});expect(p.name).toBe("全角 太郎");
    // 担当外のイベントの管理者: 画面は落とさず「権限がありません」と返し、チケットは変わらない
    as("mgr2");const t2=await mkTicket();
    expect(await transfer(input(t2.ticket.id))).toMatchObject({ok:false,state:{message:expect.stringContaining("権限")}});
    expect((await db.ticket.findUniqueOrThrow({where:{id:t2.ticket.id}})).participantId).toBe(t2.participant.id);
    // 受付スタッフは操作自体ができない
    as("staff");await expect(tr.transferTicket({},form(input(t2.ticket.id)))).rejects.toThrow("FORBIDDEN");
  });
  it("譲渡(管理者): 電話番号を共有する別の人がいても、メールアドレスが一致する人に譲渡される",async()=>{
    as("admin");const t=await mkTicket();
    const shared=`060-${String(Math.floor(Math.random()*1e8)).padStart(8,"0").replace(/^(\d{4})(\d{4})$/,"$1-$2")}`;
    const first=await db.participant.create({data:{name:`家族A-${run}`,nameKana:"カゾク",phone:shared,email:`fam-a-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}});
    const second=await db.participant.create({data:{name:`家族B-${run}`,nameKana:"カゾク",phone:shared,email:`fam-b-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}});
    expect(first.createdAt.getTime()).toBeLessThanOrEqual(second.createdAt.getTime());
    expect((await transfer(input(t.ticket.id,{phone:shared,email:second.email}))).ok).toBe(true);
    expect((await db.ticket.findUniqueOrThrow({where:{id:t.ticket.id}})).participantId).toBe(second.id);
  });
  it("発行・送付ボタン: 未入金(立替など)でも、理由を選べば入金済み+QR発行+メール送付。金額は理由に応じる",async()=>{
    as("mgr");mails=[];
    const adv=await mkTicket({paid:false});
    const r=await redirectOf(()=>iss.issueAndSendTicket(form({ticketId:adv.ticket.id,basis:"ADVANCE",back:`/participants?event=${eventId}`})));
    expect(r.redirect).toContain("notice=ticket_issued_sent");expect(r.redirect).toContain(`event=${eventId}`);
    const t=await db.ticket.findUniqueOrThrow({where:{id:adv.ticket.id},include:{payments:true}});
    expect(t).toMatchObject({paymentStatus:"PAID",status:"ACTIVE"});expect(t.qrTokenHash).not.toBe(adv.ticket.qrTokenHash);
    expect(t.payments).toHaveLength(1);expect(t.payments[0]).toMatchObject({amount:5000,paymentMethod:"ADVANCE",status:"PAID",confirmedBy:u.mgr.id});
    expect(mails.some(m=>m.to.includes(adv.participant.email)&&(m.attachments?.length??0)===1)).toBe(true);// QR付きで届く
    expect((await db.eventRegistration.findFirstOrThrow({where:{ticketId:t.id}})).attendanceStatus).toBe("PAID");
    expect(await db.auditLog.count({where:{action:"TICKET_ISSUED_MANUALLY",entityId:t.id}})).toBe(1);
    const free=await mkTicket({paid:false});
    await redirectOf(()=>iss.issueAndSendTicket(form({ticketId:free.ticket.id,basis:"COMPLIMENTARY"})));
    expect((await db.payment.findFirstOrThrow({where:{ticketId:free.ticket.id}}))).toMatchObject({amount:0,paymentMethod:"COMPLIMENTARY"});
  });
  it("発行・送付ボタン: 入金済みなら再送(24時間3回まで)。受付済み・取消・未配布・理由なし・権限なしは拒否",async()=>{
    as("mgr");mails=[];const paid=await mkTicket();
    for(let i=0;i<3;i++){const r=await redirectOf(()=>iss.issueAndSendTicket(form({ticketId:paid.ticket.id})));expect(r.redirect).toContain("notice=ticket_sent")}
    expect(mails.filter(m=>m.to.includes(paid.participant.email))).toHaveLength(3);
    expect((await redirectOf(()=>iss.issueAndSendTicket(form({ticketId:paid.ticket.id})))).redirect).toContain("error=rate_limited");
    const cases:[string,Awaited<ReturnType<typeof mkTicket>>,string][]=[["not_claimed",await mkTicket({claimed:false,paid:false}),"ADVANCE"],["cancelled",await mkTicket({status:"CANCELLED",paid:false}),"ADVANCE"],["basis_required",await mkTicket({paid:false}),""]];
    for(const [code,t,basis] of cases){expect((await redirectOf(()=>iss.issueAndSendTicket(form({ticketId:t.ticket.id,...(basis?{basis}:{})})))).redirect).toContain(`error=${code}`)}
    const used=await mkTicket();await db.checkin.create({data:{eventId,ticketId:used.ticket.id,participantId:used.participant.id,checkedInBy:u.staff.id,checkinType:"QR"}});
    expect((await redirectOf(()=>iss.issueAndSendTicket(form({ticketId:used.ticket.id})))).redirect).toContain("error=used");
    as("mgr2");const foreign=await mkTicket({paid:false});
    expect((await redirectOf(()=>iss.issueAndSendTicket(form({ticketId:foreign.ticket.id,basis:"ADVANCE"})))).redirect).toContain("error=forbidden");
    expect((await db.ticket.findUniqueOrThrow({where:{id:foreign.ticket.id}})).paymentStatus).toBe("UNPAID");
    as("staff");await expect(iss.issueAndSendTicket(form({ticketId:foreign.ticket.id,basis:"ADVANCE"}))).rejects.toThrow("FORBIDDEN");
  });
  it("発行・送付ボタン: メール送信が未設定・失敗でも、チケットは発行され、その旨が分かる",async()=>{
    as("admin");
    const a=await mkTicket({paid:false});delete process.env.RESEND_API_KEY;
    expect((await redirectOf(()=>iss.issueAndSendTicket(form({ticketId:a.ticket.id,basis:"CONFIRMED"})))).redirect).toContain("notice=ticket_issued_noemail");
    expect((await db.ticket.findUniqueOrThrow({where:{id:a.ticket.id}})).paymentStatus).toBe("PAID");
    process.env.RESEND_API_KEY="re_test";mailStatus=500;
    const b=await mkTicket({paid:false});
    const r=await redirectOf(()=>iss.issueAndSendTicket(form({ticketId:b.ticket.id,basis:"CONFIRMED"})));
    expect(r.redirect).toMatch(/notice=ticket_issued_(mailfailed|sent)/);expect((await db.ticket.findUniqueOrThrow({where:{id:b.ticket.id}})).paymentStatus).toBe("PAID");
    mailStatus=200;
  });
});
