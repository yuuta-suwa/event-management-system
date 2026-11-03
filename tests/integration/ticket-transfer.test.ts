import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async()=>{throw new Error("UNUSED_IN_TEST")}}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
const secret="t".repeat(48);
type Mods={db:typeof import("@/server/db").db;claimTicket:typeof import("@/features/tickets/claim-actions").claimTicket;issueShareLink:typeof import("@/features/participants/share-actions").issueShareLink;revokeShareLinks:typeof import("@/features/participants/share-actions").revokeShareLinks;getTicketByToken:typeof import("@/features/tickets/data").getTicketByToken;getMyRegistration:typeof import("@/features/participants/my-registration").getMyRegistration;issueShareToken:typeof import("@/features/tickets/share-token").issueShareToken;shareExpiry:typeof import("@/features/tickets/share-token").shareExpiry;issueClaimToken:typeof import("@/features/tickets/claim-token").issueClaimToken;issueRegistrationToken:typeof import("@/features/participants/registration-token").issueRegistrationToken;issueTicketToken:typeof import("@/features/tickets/token").issueTicketToken;hashTicketToken:typeof import("@/features/tickets/token").hashTicketToken};
describe.skipIf(!enabled)("チケットの配布・譲渡（実DB・使い捨てテストDBのみ）",()=>{
  let m:Mods;let eventId:string;let managerId:string;let orderId:string;let buyerId:string;
  const ids={t1:randomUUID(),t2:randomUUID(),t3:randomUUID(),t4:randomUUID(),t5:randomUUID()};
  const run=randomUUID().slice(0,8);const people=new Map<string,{name:string;nameKana:string;phone:string;email:string}>();
  const person=(key:string)=>{let p=people.get(key);if(!p){p={name:`${key} 太郎`,nameKana:`${key} タロウ`,phone:`090${String(Math.floor(Math.random()*1e8)).padStart(8,"0")}`,email:`${key.toLowerCase()}-${run}@example.com`};people.set(key,p)}return p};
  async function claim(token:string,key:string){
    const p=person(key);const f=new FormData();f.set("token",token);f.set("name",p.name);f.set("nameKana",p.nameKana);f.set("phone",p.phone);f.set("email",p.email);f.set("privacy","on");
    try{const r=await m.claimTicket({},f);return {message:r.message,redirect:null as string|null}}catch(e){const msg=e instanceof Error?e.message:"";if(msg.startsWith("REDIRECT:"))return {message:undefined,redirect:msg.slice(9)};throw e}
  }
  const share=(ticketId:string,version=0,expiresAt?:number)=>m.issueShareToken({ticketId,shareVersion:version,expiresAt:expiresAt??m.shareExpiry()},secret);
  const form=(token:string,ticketId:string)=>{const f=new FormData();f.set("token",token);f.set("ticketId",ticketId);return f};
  const byEmail=(key:string)=>m.db.participant.findFirstOrThrow({where:{email:person(key).email}});
  beforeAll(async()=>{
    process.env.DATABASE_URL=url;process.env.QR_TOKEN_SECRET=secret;
    const [{db},{claimTicket},{issueShareLink,revokeShareLinks},{getTicketByToken},{getMyRegistration},{issueShareToken,shareExpiry},{issueClaimToken},{issueRegistrationToken},{issueTicketToken,hashTicketToken}]=await Promise.all([import("@/server/db"),import("@/features/tickets/claim-actions"),import("@/features/participants/share-actions"),import("@/features/tickets/data"),import("@/features/participants/my-registration"),import("@/features/tickets/share-token"),import("@/features/tickets/claim-token"),import("@/features/participants/registration-token"),import("@/features/tickets/token")]);
    m={db,claimTicket,issueShareLink,revokeShareLinks,getTicketByToken,getMyRegistration,issueShareToken,shareExpiry,issueClaimToken,issueRegistrationToken,issueTicketToken,hashTicketToken};
    const manager=await db.user.create({data:{name:"管理者",email:`mgr-${randomUUID()}@example.com`,role:"EVENT_MANAGER"}});managerId=manager.id;
    const category=await db.eventCategory.create({data:{name:`テスト-${run}`,slug:`t-${randomUUID()}`}});
    const day=new Date(Date.now()+30*86400000);
    const event=await db.event.create({data:{categoryId:category.id,name:"譲渡テストイベント",description:"テスト用イベントの説明です。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity:50,price:1000,organizer:"主催",managerId,applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED",lineNotifications:true}});eventId=event.id;
    const buyer=await db.participant.create({data:{...person("A"),lineLinkCode:`L${randomUUID().slice(0,8)}`}});buyerId=buyer.id;
    const order=await db.ticketOrder.create({data:{eventId,buyerParticipantId:buyerId,quantity:5,claimedCount:1}});orderId=order.id;
    let n=0;
    for(const [key,id] of Object.entries(ids)){n++;const token=issueTicketToken(id,1,secret);await db.ticket.create({data:{id,eventId,orderId,participantId:buyerId,ticketNumber:`TEST-${key}-${randomUUID().slice(0,4)}`,qrTokenHash:hashTicketToken(token),status:"ACTIVE",paymentStatus:"PAID",claimed:key==="t1"}});await db.payment.create({data:{ticketId:id,amount:1000,status:"PAID",paidAt:new Date()}});if(n===1)await db.eventRegistration.create({data:{eventId,participantId:buyerId,ticketId:id,attendanceStatus:"PAID",applicationSource:"WEB"}})}
  });
  afterAll(async()=>{await m?.db.$disconnect()});

  it("T02/T03 入金承認済みの未配布チケットを後から配布できる（購入・入金履歴は維持）",async()=>{
    const r=await claim(share(ids.t2),"B");expect(r.redirect).toMatch(/^\/my\/reg1\./);
    const b=await byEmail("B");const t=await m.db.ticket.findUniqueOrThrow({where:{id:ids.t2},include:{payments:true}});
    expect(t.participantId).toBe(b.id);expect(t.claimed).toBe(true);expect(t.qrTokenVersion).toBe(2);expect(t.shareVersion).toBe(1);expect(t.paymentStatus).toBe("PAID");expect(t.status).toBe("ACTIVE");expect(t.orderId).toBe(orderId);expect(t.payments).toHaveLength(1);
    expect(await m.db.eventRegistration.findFirst({where:{ticketId:ids.t2,participantId:b.id}})).not.toBeNull();
    expect((await m.db.ticketOrder.findUniqueOrThrow({where:{id:orderId}})).claimedCount).toBe(2);
    const tr=await m.db.ticketTransfer.findFirstOrThrow({where:{ticketId:ids.t2}});expect(tr).toMatchObject({source:"DISTRIBUTION",oldParticipantId:buyerId,newParticipantId:b.id,transferredBy:null});
    const jobs=await m.db.notificationJob.findMany({where:{eventId,payload:{path:["participantId"],equals:b.id}}});expect(jobs.map(j=>j.type).sort()).toEqual(["APPLICATION","TICKET"]);
  });
  it("T11 受け取り済みの同じリンクは再利用できない",async()=>{
    const r=await claim(share(ids.t2),"X");expect(r.redirect).toBeNull();expect(r.message).toBeTruthy();
    expect(await m.db.participant.findFirst({where:{email:person("X").email},include:{registrations:true}}).then(p=>p?.registrations.length??0)).toBe(0);
  });
  it("同時に受け取っても1人だけが成功する",async()=>{
    const token=share(ids.t3);const results=await Promise.all([claim(token,"C"),claim(token,"D")]);
    expect(results.filter(r=>r.redirect).length).toBe(1);expect(results.filter(r=>r.message).length).toBe(1);
    expect(await m.db.eventRegistration.count({where:{ticketId:ids.t3}})).toBe(1);
  });
  it("T06 保有者BがEへ譲渡でき、旧保有者の登録は切り離される",async()=>{
    const b=await byEmail("B");const regB=await m.db.eventRegistration.findFirstOrThrow({where:{ticketId:ids.t2}});
    const myToken=m.issueRegistrationToken(regB.id,secret);
    const issued=await m.issueShareLink({},form(myToken,ids.t2));expect(issued.url).toBeTruthy();
    const linkToken=issued.url!.split("/claim/")[1];
    const r=await claim(linkToken,"E");expect(r.redirect).toMatch(/^\/my\/reg1\./);
    const e=await byEmail("E");const t=await m.db.ticket.findUniqueOrThrow({where:{id:ids.t2},include:{payments:true}});
    expect(t.participantId).toBe(e.id);expect(t.qrTokenVersion).toBe(3);expect(t.paymentStatus).toBe("PAID");expect(t.orderId).toBe(orderId);expect(t.payments).toHaveLength(1);
    expect(await m.db.eventRegistration.findUniqueOrThrow({where:{id:regB.id}})).toMatchObject({ticketId:null,attendanceStatus:"CANCELLED",participantId:b.id});
    expect(await m.db.eventRegistration.findFirst({where:{ticketId:ids.t2,participantId:e.id}})).not.toBeNull();
    expect(await m.db.ticketTransfer.findFirstOrThrow({where:{ticketId:ids.t2,source:"HOLDER"}})).toMatchObject({oldParticipantId:b.id,newParticipantId:e.id,transferredBy:null});
  });
  it("T07/T08 旧QRは失効し新しいQRだけが有効",async()=>{
    expect(await m.getTicketByToken(m.issueTicketToken(ids.t2,2,secret),secret)).toBeNull();
    expect(await m.getTicketByToken(m.issueTicketToken(ids.t2,1,secret),secret)).toBeNull();
    const fresh=await m.getTicketByToken(m.issueTicketToken(ids.t2,3,secret),secret);expect(fresh?.participantName).toBe(person("E").name);
  });
  it("旧保有者Bのマイページから新保有者の情報・QRは見えない",async()=>{
    const regB=await m.db.eventRegistration.findFirstOrThrow({where:{participant:{email:person("B").email},eventId}});
    const view=await m.getMyRegistration(m.issueRegistrationToken(regB.id,secret));
    expect(view?.participant.name).toBe(person("B").name);expect(view?.ticket).toBeNull();expect(JSON.stringify(view)).not.toContain(person("E").email);
  });
  it("購入者Aは他人が保有するチケットを一方的に再譲渡できない",async()=>{
    const regA=await m.db.eventRegistration.findFirstOrThrow({where:{participantId:buyerId,eventId}});
    const r=await m.issueShareLink({},form(m.issueRegistrationToken(regA.id,secret),ids.t2));expect(r.url).toBeUndefined();expect(r.message).toContain("操作できません");
  });
  it("購入者Aのチケット一覧に全チケット・保有者・履歴が出る",async()=>{
    const regA=await m.db.eventRegistration.findFirstOrThrow({where:{participantId:buyerId,eventId}});
    const view=await m.getMyRegistration(m.issueRegistrationToken(regA.id,secret));
    expect(view?.tickets).toHaveLength(5);const t2=view!.tickets.find(t=>t.id===ids.t2)!;
    expect(t2.holderName).toBe(person("E").name);expect(t2.isMine).toBe(false);expect(t2.history.map(h=>h.source)).toEqual(["DISTRIBUTION","HOLDER"]);
    expect(view!.tickets.find(t=>t.id===ids.t4)!.holderName).toBeNull();
  });
  it("取り消した配布リンクは使えず、チケットは未配布のまま",async()=>{
    const regA=await m.db.eventRegistration.findFirstOrThrow({where:{participantId:buyerId,eventId}});const my=m.issueRegistrationToken(regA.id,secret);
    const issued=await m.issueShareLink({},form(my,ids.t4));expect(issued.url).toBeTruthy();const linkToken=issued.url!.split("/claim/")[1];
    expect((await m.revokeShareLinks({},form(my,ids.t4))).message).toContain("取り消");
    const r=await claim(linkToken,"F");expect(r.redirect).toBeNull();expect(r.message).toContain("取り消");
    expect((await m.db.ticket.findUniqueOrThrow({where:{id:ids.t4}})).claimed).toBe(false);
  });
  it("有効期限切れのリンクは使えない",async()=>{
    const r=await claim(share(ids.t4,1,Math.floor(Date.now()/1000)-10),"F");expect(r.redirect).toBeNull();expect(r.message).toContain("有効期限");
  });
  it("既存の旧形式(clm1)リンクは未配布チケットで引き続き使える",async()=>{
    const legacy=m.issueClaimToken(ids.t5,secret);const r=await claim(legacy,"G");expect(r.redirect).toMatch(/^\/my\//);
    const again=await claim(legacy,"H");expect(again.redirect).toBeNull();expect(again.message).toBeTruthy();
  });
  it("現在の保有者と同じ人には譲渡できない",async()=>{
    const t=await m.db.ticket.findUniqueOrThrow({where:{id:ids.t2}});const r=await claim(share(ids.t2,t.shareVersion),"E");
    expect(r.redirect).toBeNull();expect(r.message).toContain("同じ");
  });
  it("T12 受付済みチケットは譲渡できない",async()=>{
    const regA=await m.db.eventRegistration.findFirstOrThrow({where:{participantId:buyerId,eventId}});
    await m.db.checkin.create({data:{eventId,ticketId:ids.t1,participantId:buyerId,checkedInBy:managerId,checkinType:"QR"}});
    const issued=await m.issueShareLink({},form(m.issueRegistrationToken(regA.id,secret),ids.t1));expect(issued.url).toBeUndefined();expect(issued.message).toContain("受付済み");
    const t1=await m.db.ticket.findUniqueOrThrow({where:{id:ids.t1}});const r=await claim(share(ids.t1,t1.shareVersion),"I");
    expect(r.redirect).toBeNull();expect((await m.db.ticket.findUniqueOrThrow({where:{id:ids.t1}})).participantId).toBe(buyerId);
  });
});
