import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
const state=vi.hoisted(()=>({user:{id:"",role:"SUPER_ADMIN",name:"x"} as {id:string;role:string;name:string}|null}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async()=>{throw new Error("unused")},validatedSessionUser:async()=>state.user}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
describe.skipIf(!enabled)("退出の記録・履歴・理由（実DB・使い捨てテストDBのみ）",()=>{
  let db:typeof import("@/server/db").db;
  let svc:typeof import("@/features/checkins/service");
  let ex:typeof import("@/features/checkins/exit-service");
  let rc:typeof import("@/features/checkins/reception-code");
  let tk:typeof import("@/features/tickets/token");
  let route:typeof import("@/app/api/checkouts/route");
  let eventId:string;
  const u:Record<string,{id:string;name:string;role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF"}>={};
  const secret="t".repeat(48);const run=randomUUID().slice(0,6);let seq=0;
  async function mkTicket(opts:{name?:string;checkedIn?:boolean}={}){
    const n=++seq;
    const p=await db.participant.create({data:{name:opts.name??`退出者${n}-${run}`,nameKana:`タイシュツ${n}`,phone:`090-1111-${String(1000+n)}`,email:`x${n}-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}});
    const t=await db.ticket.create({data:{eventId,participantId:p.id,ticketNumber:`X-${run}-${n}`,qrTokenHash:"pending-"+randomUUID(),status:"ACTIVE",paymentStatus:"PAID",issuedAt:new Date()}});
    const token=tk.issueTicketToken(t.id,1,secret);
    await db.ticket.update({where:{id:t.id},data:{qrTokenHash:tk.hashTicketToken(token)}});
    await db.eventRegistration.create({data:{eventId,participantId:p.id,ticketId:t.id,attendanceStatus:"EXPECTED",applicationSource:"WEB"}});
    if(opts.checkedIn!==false){
      const r=await svc.processCheckin({token,eventId,operatorId:u.staff.id,operatorName:u.staff.name,operatorRole:"RECEPTION_STAFF"});expect(r.kind).toBe("OK");
    }
    return {ticket:t,participant:p,token};
  }
  const staff=()=>({id:u.staff.id,name:u.staff.name,role:u.staff.role});
  const post=(body:unknown)=>route.POST(new Request("http://localhost/api/checkouts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}));
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:secret});
    ({db}=await import("@/server/db"));svc=await import("@/features/checkins/service");ex=await import("@/features/checkins/exit-service");rc=await import("@/features/checkins/reception-code");tk=await import("@/features/tickets/token");route=await import("@/app/api/checkouts/route");
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF")=>{const x=await db.user.create({data:{name:`${key}-${run}`,email:`${key}-${run}@example.com`,role}});u[key]={id:x.id,name:x.name,role}};
    await Promise.all([mk("admin","SUPER_ADMIN"),mk("mgr","EVENT_MANAGER"),mk("staff","RECEPTION_STAFF"),mk("outsider","RECEPTION_STAFF")]);
    const category=await db.eventCategory.create({data:{name:`CO-${run}`,slug:`co-${randomUUID()}`}});
    const day=new Date(Date.now()+5*86400000);
    eventId=(await db.event.create({data:{categoryId:category.id,name:"退出テスト",description:"テスト用イベントです。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity:200,price:5000,organizer:"主催",managerId:u.mgr.id,applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED"}})).id;
    await db.eventStaff.create({data:{eventId,userId:u.staff.id}});
  });
  afterAll(async()=>{await db?.$disconnect()});

  it("QRで退出: 受付済みの人の退出時刻・理由・担当・方法が履歴に残る",async()=>{
    const {ticket,token,participant}=await mkTicket();
    const r=await ex.processCheckoutByQr({token,eventId,operator:staff(),reason:{code:"ILL",note:"頭痛のため"}});
    expect(r).toMatchObject({kind:"EXIT_OK",ticketNumber:ticket.ticketNumber,exitReasonCode:"ILL",exitReason:"体調不良",exitNote:"頭痛のため"});
    const c=await db.checkout.findFirstOrThrow({where:{ticketId:ticket.id}});
    expect(c).toMatchObject({eventId,participantId:participant.id,checkedOutBy:u.staff.id,checkoutType:"QR",reasonCode:"ILL",reasonNote:"頭痛のため",returnedAt:null});
    expect(Math.abs(c.checkedOutAt.getTime()-Date.now())).toBeLessThan(60_000);
    expect(await db.auditLog.count({where:{action:"QR_CHECKOUT",entityId:c.id}})).toBe(1);
    // 受付の記録(Checkin)は残ったまま
    expect(await db.checkin.count({where:{ticketId:ticket.id}})).toBe(1);
  });
  it("受付コード・参加者検索でも退出できる。受付コードの入力ミスは受付と同じ制限が効く",async()=>{
    const a=await mkTicket();const code=await rc.ensureReceptionCode(a.ticket.id);
    expect((await ex.processCheckoutByCode({eventId,code:code!,operator:staff(),reason:{code:"LEAVE"}})).kind).toBe("EXIT_OK");
    expect((await db.checkout.findFirstOrThrow({where:{ticketId:a.ticket.id}})).checkoutType).toBe("RECEPTION_CODE");
    const b=await mkTicket();
    expect((await ex.processCheckoutBySearch({eventId,ticketId:b.ticket.id,operator:staff(),reason:{code:"URGENT",note:"仕事の電話"}})).kind).toBe("EXIT_OK");
    expect((await db.checkout.findFirstOrThrow({where:{ticketId:b.ticket.id}})).checkoutType).toBe("NAME_SEARCH");
    expect((await ex.processCheckoutByCode({eventId,code:"12345",operator:staff(),reason:{code:"LEAVE"}})).kind).toBe("INVALID");
  });
  it("まだ受付していない人は退出できない／二重の退出は『退出済み』で、記録は増えない",async()=>{
    const n=await mkTicket({checkedIn:false});
    expect((await ex.processCheckoutByQr({token:n.token,eventId,operator:staff(),reason:{code:"LEAVE"}})).kind).toBe("NOT_CHECKED_IN");
    expect(await db.checkout.count({where:{ticketId:n.ticket.id}})).toBe(0);
    const a=await mkTicket();
    await ex.processCheckoutByQr({token:a.token,eventId,operator:staff(),reason:{code:"LEAVE"}});
    const again=await ex.processCheckoutByQr({token:a.token,eventId,operator:staff(),reason:{code:"ILL"}});
    expect(again).toMatchObject({kind:"ALREADY_EXITED",exitReasonCode:"LEAVE"});
    expect(await db.checkout.count({where:{ticketId:a.ticket.id}})).toBe(1);
  });
  it("同時に2回読み取られても、退出は1件だけ(部分一意インデックス)",async()=>{
    const a=await mkTicket();
    const rs=await Promise.all([1,2,3].map(()=>ex.processCheckoutByQr({token:a.token,eventId,operator:staff(),reason:{code:"LEAVE"}})));
    expect(rs.filter(r=>r.kind==="EXIT_OK").length).toBe(1);expect(rs.filter(r=>r.kind==="ALREADY_EXITED").length).toBe(2);
    expect(await db.checkout.count({where:{ticketId:a.ticket.id}})).toBe(1);
  });
  it("理由: 未知のコードと、メモなしの『その他』は記録しない",async()=>{
    const a=await mkTicket();
    expect((await ex.processCheckoutByQr({token:a.token,eventId,operator:staff(),reason:{code:"OTHER"}})).kind).toBe("INVALID");
    expect((await ex.processCheckoutByQr({token:a.token,eventId,operator:staff(),reason:{code:"NOPE"}})).kind).toBe("INVALID");
    expect(await db.checkout.count({where:{ticketId:a.ticket.id}})).toBe(0);
    expect((await ex.processCheckoutByQr({token:a.token,eventId,operator:staff(),reason:{code:"OTHER",note:"託児所から呼び出し"}})).kind).toBe("EXIT_OK");
  });
  it("理由は後から直せる(変更前後を監査ログに残す)。再入場は同じ行に戻り時刻が入り、履歴は消えない",async()=>{
    const a=await mkTicket();
    const out=await ex.processCheckoutByQr({token:a.token,eventId,operator:staff(),reason:{code:"LEAVE"}});
    const upd=await ex.updateCheckoutReason({checkoutId:out.checkoutId!,operator:staff(),reason:{code:"TEMPORARY",note:"電話のため"}});
    expect(upd).toMatchObject({kind:"EXIT_OK",exitReasonCode:"TEMPORARY",exitNote:"電話のため"});
    const log=await db.auditLog.findFirstOrThrow({where:{action:"CHECKOUT_REASON_UPDATED",entityId:out.checkoutId}});
    expect(log.before).toMatchObject({reason:"LEAVE"});expect(log.after).toMatchObject({reason:"TEMPORARY",note:"電話のため"});
    expect((await ex.updateCheckoutReason({checkoutId:out.checkoutId!,operator:staff(),reason:{code:"OTHER"}})).kind).toBe("INVALID");
    const back=await ex.recordReentry({ticketId:a.ticket.id,eventId,operator:staff()});
    expect(back.kind).toBe("REENTER_OK");
    const row=await db.checkout.findUniqueOrThrow({where:{id:out.checkoutId}});expect(row.returnedAt).not.toBeNull();expect(row.returnedBy).toBe(u.staff.id);
    expect((await ex.recordReentry({ticketId:a.ticket.id,eventId,operator:staff()})).kind).toBe("INVALID");// 退出中でなければ再入場にならない
    // 再入場のあと、もう一度退出すると2件目の履歴になる
    expect((await ex.processCheckoutByQr({token:a.token,eventId,operator:staff(),reason:{code:"LEAVE"}})).kind).toBe("EXIT_OK");
    expect(await db.checkout.count({where:{ticketId:a.ticket.id}})).toBe(2);
  });
  it("別イベント・権限のない人・取消済みチケットは退出できない",async()=>{
    const a=await mkTicket();
    expect((await ex.processCheckoutByQr({token:a.token,eventId:"other-event",operator:staff(),reason:{code:"LEAVE"}})).kind).toBe("WRONG_EVENT");
    const o=u.outsider;expect((await ex.processCheckoutByQr({token:a.token,eventId,operator:{id:o.id,name:o.name,role:o.role},reason:{code:"LEAVE"}})).kind).toBe("FORBIDDEN");
    expect(await ex.recordReentry({ticketId:a.ticket.id,operator:{id:o.id,name:o.name,role:o.role}})).toMatchObject({kind:"FORBIDDEN"});
    expect(await db.checkout.count({where:{ticketId:a.ticket.id}})).toBe(0);
    const c=await mkTicket();await db.ticket.update({where:{id:c.ticket.id},data:{status:"CANCELLED"}});
    expect((await ex.processCheckoutByQr({token:c.token,eventId,operator:staff(),reason:{code:"LEAVE"}})).kind).toBe("INVALID");
  });
  it("退出履歴: 新しい順。イベントの権限がない人には出さない。参加者検索の候補にも退出状態が出る",async()=>{
    const a=await mkTicket({name:`履歴太郎-${run}`});
    await ex.processCheckoutByQr({token:a.token,eventId,operator:staff(),reason:{code:"TROUBLE",note:"泥酔のため"}});
    const h=await ex.listExitHistory({eventId,operator:{id:u.mgr.id,name:u.mgr.name,role:"EVENT_MANAGER"}});
    expect(h).not.toBe("FORBIDDEN");if(h!=="FORBIDDEN"){expect(h[0]).toMatchObject({name:`履歴太郎-${run}`,reasonCode:"TROUBLE",reasonNote:"泥酔のため",operatorName:u.staff.name});
      for(let i=1;i<h.length;i++)expect(h[i-1].exitedAt.getTime()).toBeGreaterThanOrEqual(h[i].exitedAt.getTime())}
    expect(await ex.listExitHistory({eventId,operator:{id:u.outsider.id,name:"x",role:"RECEPTION_STAFF"}})).toBe("FORBIDDEN");
    const cand=await svc.searchCheckinCandidates({eventId,query:`履歴太郎-${run}`,operator:staff()});
    expect(Array.isArray(cand)&&cand[0].exitedAt).toBeTruthy();
  });
  it("API: ログイン必須・理由の指定必須。成功すると理由つきで記録される。理由の変更・再入場もAPI経由でできる",async()=>{
    const a=await mkTicket();
    state.user=null;expect((await post({op:"EXIT",method:"QR",token:a.token,eventId,reason:"LEAVE"})).status).toBe(401);
    state.user=u.staff;
    expect((await post({op:"EXIT",method:"QR",token:a.token,eventId})).status).toBe(400);// 理由なし
    expect((await post({op:"EXIT",method:"QR",token:a.token,eventId,reason:"BOGUS"})).status).toBe(400);
    const res=await post({op:"EXIT",method:"QR",token:a.token,eventId,reason:"URGENT",note:"仕事"});expect(res.status).toBe(200);
    const body=await res.json();expect(body).toMatchObject({kind:"EXIT_OK",exitReason:"急用・仕事"});
    const upd=await post({op:"REASON",checkoutId:body.checkoutId,reason:"LEAVE",note:""});expect((await upd.json()).exitReasonCode).toBe("LEAVE");
    const re=await post({op:"REENTER",ticketId:a.ticket.id,eventId});expect((await re.json()).kind).toBe("REENTER_OK");
    state.user=u.outsider;expect((await post({op:"EXIT",method:"QR",token:a.token,eventId,reason:"LEAVE"})).status).toBe(403);
    state.user=null;
  });
});
