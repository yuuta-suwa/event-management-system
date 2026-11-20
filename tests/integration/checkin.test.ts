import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async()=>{throw new Error("unused")},validatedSessionUser:async()=>null}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
describe.skipIf(!enabled)("受付: QR・受付コード・参加者検索（実DB・使い捨てテストDBのみ）",()=>{
  let db:typeof import("@/server/db").db;
  let svc:typeof import("@/features/checkins/service");
  let rc:typeof import("@/features/checkins/reception-code");
  let tk:typeof import("@/features/tickets/token");
  let eventId:string,otherEventId:string;
  const u:Record<string,{id:string;name:string;role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF"}>={};
  const secret="t".repeat(48);
  const run=randomUUID().slice(0,6);
  let seq=0;
  async function mkTicket(opts:{name?:string;phone?:string;paid?:boolean;event?:string}={}){
    const n=++seq;
    const p=await db.participant.create({data:{name:opts.name??`参加者${n}-${run}`,nameKana:`サンカシャ${n}`,phone:opts.phone??`090-0000-${String(1000+n)}`,email:`p${n}-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}});
    const t=await db.ticket.create({data:{eventId:opts.event??eventId,participantId:p.id,ticketNumber:`T-${run}-${n}`,qrTokenHash:"pending-"+randomUUID(),status:"ACTIVE",paymentStatus:opts.paid===false?"UNPAID":"PAID",issuedAt:new Date()}});
    const token=tk.issueTicketToken(t.id,1,secret);
    await db.ticket.update({where:{id:t.id},data:{qrTokenHash:tk.hashTicketToken(token)}});
    await db.eventRegistration.create({data:{eventId:t.eventId,participantId:p.id,ticketId:t.id,attendanceStatus:"EXPECTED",applicationSource:"WEB"}});
    return {ticket:t,participant:p,token};
  }
  const op=(k:string)=>u[k];
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:secret});
    ({db}=await import("@/server/db"));svc=await import("@/features/checkins/service");rc=await import("@/features/checkins/reception-code");tk=await import("@/features/tickets/token");
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF")=>{const x=await db.user.create({data:{name:`${key}-${run}`,email:`${key}-${run}@example.com`,role}});u[key]={id:x.id,name:x.name,role}};
    await Promise.all([mk("admin","SUPER_ADMIN"),mk("mgr","EVENT_MANAGER"),mk("staff","RECEPTION_STAFF"),mk("outsider","RECEPTION_STAFF")]);
    const category=await db.eventCategory.create({data:{name:`C-${run}`,slug:`c-${randomUUID()}`}});
    const day=new Date(Date.now()+5*86400000);
    const mkEvent=async(name:string)=>(await db.event.create({data:{categoryId:category.id,name,description:"テスト用イベントです。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity:200,price:5000,organizer:"主催",managerId:u.mgr.id,applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED"}})).id;
    eventId=await mkEvent("受付テスト");otherEventId=await mkEvent("別イベント");
    await db.eventStaff.create({data:{eventId,userId:u.staff.id}});
  });
  afterAll(async()=>{await db?.$disconnect()});

  it("T22/T26/T27 QR受付: 受付日時・担当者・方法が保存され、二重受付は拒否される(T25)",async()=>{
    const {ticket,token}=await mkTicket();
    const r=await svc.processCheckin({token,eventId,operatorId:op("staff").id,operatorName:op("staff").name,operatorRole:"RECEPTION_STAFF"});
    expect(r.kind).toBe("OK");
    const c=await db.checkin.findUniqueOrThrow({where:{ticketId:ticket.id}});
    expect(c).toMatchObject({checkinType:"QR",checkedInBy:op("staff").id,eventId});
    expect(Math.abs(c.checkedInAt.getTime()-Date.now())).toBeLessThan(60_000);
    expect((await db.ticket.findUniqueOrThrow({where:{id:ticket.id}})).status).toBe("USED");
    const again=await svc.processCheckin({token,eventId,operatorId:op("mgr").id,operatorName:"mgr",operatorRole:"EVENT_MANAGER"});
    expect(again.kind).toBe("ALREADY_CHECKED_IN");expect(again.checkedInBy).toBe(op("staff").name);
  });
  it("T44 権限のない受付担当は3方式すべてで拒否される",async()=>{
    const {ticket,token}=await mkTicket();
    const code=(await rc.ensureReceptionCode(ticket.id))!;
    const outsider={id:op("outsider").id,name:"x",role:"RECEPTION_STAFF" as const};
    expect((await svc.processCheckin({token,operatorId:outsider.id,operatorName:"x",operatorRole:outsider.role})).kind).toBe("FORBIDDEN");
    expect((await svc.processCheckinByCode({eventId,code,operator:outsider})).kind).toBe("FORBIDDEN");
    expect((await svc.processCheckinBySearch({eventId,ticketId:ticket.id,verification:"ID_DOCUMENT",operator:outsider})).kind).toBe("FORBIDDEN");
    expect(await svc.searchCheckinCandidates({eventId,query:"参加者",operator:outsider})).toBe("FORBIDDEN");
    expect(await db.checkin.count({where:{ticketId:ticket.id}})).toBe(0);
  });
  it("T23 受付コード受付: 6桁・イベント単位で照合し、受付済みは再受付できない。監査ログに生のコードを残さない",async()=>{
    const {ticket}=await mkTicket();
    const code=(await rc.ensureReceptionCode(ticket.id))!;
    expect(code).toMatch(/^\d{6}$/);
    expect(await rc.ensureReceptionCode(ticket.id)).toBe(code);// 冪等
    const staff={id:op("staff").id,name:op("staff").name,role:"RECEPTION_STAFF" as const};
    // 別イベントの受付画面では使えない
    expect((await svc.processCheckinByCode({eventId:otherEventId,code,operator:{...staff,role:"SUPER_ADMIN"}})).kind).toBe("INVALID");
    const ok=await svc.processCheckinByCode({eventId,code:` ${code.slice(0,3)}-${code.slice(3)} `,operator:staff});
    expect(ok.kind).toBe("OK");
    expect((await db.checkin.findUniqueOrThrow({where:{ticketId:ticket.id}})).checkinType).toBe("RECEPTION_CODE");
    expect((await svc.processCheckinByCode({eventId,code,operator:staff})).kind).toBe("ALREADY_CHECKED_IN");
    const logs=await db.auditLog.findMany({where:{OR:[{entityId:ticket.id},{after:{path:["ticketId"],equals:ticket.id}}]}});
    expect(JSON.stringify(logs)).not.toContain(code);
    expect(logs.some(l=>l.action==="RECEPTION_CODE_CHECKIN")).toBe(true);
  });
  it("受付コードの総当たり対策: 失敗が続くとロックされ、正しいコードでも拒否される",async()=>{
    const brute={id:(await db.user.create({data:{name:`brute-${run}`,email:`brute-${run}@example.com`,role:"SUPER_ADMIN"}})).id,name:"brute",role:"SUPER_ADMIN" as const};
    const {ticket}=await mkTicket();const code=(await rc.ensureReceptionCode(ticket.id))!;
    const wrong=code==="000000"?"111111":"000000";
    for(let i=0;i<rc.CODE_FAILURE_LIMIT;i++)expect((await svc.processCheckinByCode({eventId,code:wrong,operator:brute})).kind).toBe("INVALID");
    expect((await svc.processCheckinByCode({eventId,code,operator:brute})).kind).toBe("LOCKED");
    expect(await db.checkin.count({where:{ticketId:ticket.id}})).toBe(0);
    expect((await svc.processCheckinByCode({eventId,code:"12ab",operator:op("admin")})).kind).toBe("INVALID");
  });
  it("T24 参加者検索受付: 同姓同名は申告のみでは受付できず、電話番号下4桁で確認できる。確認方法を保存する",async()=>{
    const a=await mkTicket({name:`同名太郎${run}`,phone:"090-1111-2345"});
    const b=await mkTicket({name:`同名太郎${run}`,phone:"080-9999-7777"});
    const staff={id:op("staff").id,name:op("staff").name,role:"RECEPTION_STAFF" as const};
    const found=await svc.searchCheckinCandidates({eventId,query:`同名太郎${run}`,operator:staff});
    expect(found).not.toBe("FORBIDDEN");
    expect((found as Awaited<ReturnType<typeof svc.searchCheckinCandidates>> & unknown[]).length).toBe(2);
    expect((found as {sameNameCount:number;phoneLast4?:string}[]).every(c=>c.sameNameCount===2&&!("phoneLast4" in c))).toBe(true);
    // 申告のみは拒否
    expect((await svc.processCheckinBySearch({eventId,ticketId:a.ticket.id,verification:"SELF_DECLARED",operator:staff})).kind).toBe("VERIFY_REQUIRED");
    // 下4桁が違う・欠落
    expect((await svc.processCheckinBySearch({eventId,ticketId:a.ticket.id,verification:"PHONE_LAST4",phoneLast4:"7777",operator:staff})).kind).toBe("VERIFY_REQUIRED");
    expect((await svc.processCheckinBySearch({eventId,ticketId:a.ticket.id,verification:"PHONE_LAST4",operator:staff})).kind).toBe("VERIFY_REQUIRED");
    expect(await db.checkin.count({where:{ticketId:a.ticket.id}})).toBe(0);
    expect((await svc.processCheckinBySearch({eventId,ticketId:a.ticket.id,verification:"PHONE_LAST4",phoneLast4:"2345",operator:staff})).kind).toBe("OK");
    const c=await db.checkin.findUniqueOrThrow({where:{ticketId:a.ticket.id}});
    expect(c).toMatchObject({checkinType:"NAME_SEARCH",verification:"PHONE_LAST4",checkedInBy:staff.id});
    // もう一方の同姓同名は未受付のまま
    expect(await db.checkin.count({where:{ticketId:b.ticket.id}})).toBe(0);
    // 別イベントのチケットは検索受付できない
    const other=await mkTicket({event:otherEventId});
    expect((await svc.processCheckinBySearch({eventId,ticketId:other.ticket.id,verification:"ID_DOCUMENT",operator:{...staff,role:"SUPER_ADMIN"}})).kind).toBe("INVALID");
  });
  it("D-6 QR・受付コード・検索を同時に使っても受付は1回だけ（二重受付防止率100%）",async()=>{
    const {ticket,token}=await mkTicket();const code=(await rc.ensureReceptionCode(ticket.id))!;
    const staff={id:op("staff").id,name:op("staff").name,role:"RECEPTION_STAFF" as const};
    const results=await Promise.all([
      svc.processCheckin({token,eventId,operatorId:staff.id,operatorName:staff.name,operatorRole:staff.role}),
      svc.processCheckinByCode({eventId,code,operator:staff}),
      svc.processCheckinBySearch({eventId,ticketId:ticket.id,verification:"ID_DOCUMENT",operator:staff}),
      svc.processCheckin({token,eventId,operatorId:staff.id,operatorName:staff.name,operatorRole:staff.role}),
    ]);
    expect(results.filter(r=>r.kind==="OK")).toHaveLength(1);
    expect(results.filter(r=>r.kind==="ALREADY_CHECKED_IN")).toHaveLength(3);
    expect(await db.checkin.count({where:{ticketId:ticket.id}})).toBe(1);
    expect(await db.auditLog.count({where:{entityType:"Checkin",entityId:(await db.checkin.findUniqueOrThrow({where:{ticketId:ticket.id}})).id}})).toBe(1);
  });
  it("T21 譲渡で旧QR・旧受付コードが失効する／取消済みチケットは受付できない",async()=>{
    const {ticket,token}=await mkTicket();const code=(await rc.ensureReceptionCode(ticket.id))!;
    const staff={id:op("staff").id,name:op("staff").name,role:"RECEPTION_STAFF" as const};
    // 譲渡(claim/transfer と同じ更新: QR版数を上げ受付コードを失効)
    const v2=tk.issueTicketToken(ticket.id,2,secret);
    await db.ticket.update({where:{id:ticket.id},data:{qrTokenVersion:2,qrTokenHash:tk.hashTicketToken(v2),receptionCode:null,receptionCodeIssuedAt:null}});
    expect((await svc.processCheckin({token,eventId,operatorId:staff.id,operatorName:"s",operatorRole:staff.role})).kind).toBe("INVALID");
    expect((await svc.processCheckinByCode({eventId,code,operator:staff})).kind).toBe("INVALID");
    const fresh=(await rc.ensureReceptionCode(ticket.id))!;
    expect((await svc.processCheckinByCode({eventId,code:fresh,operator:staff})).kind).toBe("OK");
    const c=await mkTicket();const cc=(await rc.ensureReceptionCode(c.ticket.id))!;
    await db.ticket.update({where:{id:c.ticket.id},data:{status:"CANCELLED"}});
    expect((await svc.processCheckinByCode({eventId,code:cc,operator:staff})).kind).toBe("INVALID");
    expect((await svc.processCheckin({token:c.token,eventId,operatorId:staff.id,operatorName:"s",operatorRole:staff.role})).kind).toBe("INVALID");
    expect(await rc.ensureReceptionCode(c.ticket.id)).toBeNull();
  });
  it("未入金は確認が必要で、現地支払で受付すると入金記録と受付が同時に確定する",async()=>{
    const {ticket,token}=await mkTicket({paid:false});const code=(await rc.ensureReceptionCode(ticket.id))!;
    const staff={id:op("staff").id,name:op("staff").name,role:"RECEPTION_STAFF" as const};
    expect((await svc.processCheckinByCode({eventId,code,operator:staff})).kind).toBe("UNPAID");
    expect((await svc.processCheckinByCode({eventId,code,operator:staff,resolution:"ADMIN_CONFIRMATION"})).kind).toBe("NEEDS_ADMIN");
    expect(await db.checkin.count({where:{ticketId:ticket.id}})).toBe(0);
    expect((await svc.processCheckin({token,eventId,operatorId:staff.id,operatorName:"s",operatorRole:staff.role,resolution:"ONSITE_PAYMENT"})).kind).toBe("OK");
    expect((await db.ticket.findUniqueOrThrow({where:{id:ticket.id}})).paymentStatus).toBe("PAID");
    expect(await db.payment.count({where:{ticketId:ticket.id,paymentMethod:"ONSITE"}})).toBe(1);
  });
  it("T28/T29 連続受付: 25名をQR・受付コード・検索で連続受付し、処理時間を実測する（サーバー処理のみ・ローカルDB）",async()=>{
    const staff={id:op("staff").id,name:op("staff").name,role:"RECEPTION_STAFF" as const};
    const times:number[]=[];let ok=0;
    for(let i=0;i<25;i++){
      const {ticket,token}=await mkTicket();
      const t0=performance.now();
      let r;
      if(i%3===0)r=await svc.processCheckin({token,eventId,operatorId:staff.id,operatorName:staff.name,operatorRole:staff.role});
      else if(i%3===1){const code=(await rc.ensureReceptionCode(ticket.id))!;const t1=performance.now();r=await svc.processCheckinByCode({eventId,code,operator:staff});times.push(performance.now()-t1);ok+=r.kind==="OK"?1:0;continue}
      else r=await svc.processCheckinBySearch({eventId,ticketId:ticket.id,verification:"ID_DOCUMENT",operator:staff});
      times.push(performance.now()-t0);ok+=r.kind==="OK"?1:0;
    }
    expect(ok).toBe(25);
    const sorted=[...times].sort((a,b)=>a-b);const pct=(p:number)=>sorted[Math.min(sorted.length-1,Math.ceil(p/100*sorted.length)-1)];
    console.info(`[E-4] サーバー処理(ローカルDB) n=${times.length} p50=${pct(50).toFixed(1)}ms p95=${pct(95).toFixed(1)}ms max=${sorted.at(-1)!.toFixed(1)}ms`);
    expect(pct(95)).toBeLessThan(1000);
  });
});
