import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async()=>{throw new Error("unused")},validatedSessionUser:async()=>null}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
describe.skipIf(!enabled)("参加者画面のイベント切り替え（実DB・使い捨てテストDBのみ）",()=>{
  let db:typeof import("@/server/db").db;let data:typeof import("@/features/participants/admin-data");
  const run=randomUUID().slice(0,6);let evA:string,evB:string,evC:string;const u:Record<string,{id:string;role:"SUPER_ADMIN"|"EVENT_MANAGER"}>={};
  async function mkEvent(name:string,managerId:string,days:number){
    const category=await db.eventCategory.upsert({where:{slug:`pf-${run}`},update:{},create:{name:`PF-${run}`,slug:`pf-${run}`}});const day=new Date(Date.now()+days*86400000);
    return (await db.event.create({data:{categoryId:category.id,name:`${name}-${run}`,description:"テスト用です。",eventDate:day,startTime:day,receptionStartTime:day,endTime:new Date(day.getTime()+3600000),venueName:"会場",address:"住所",capacity:50,price:1000,organizer:"主催",managerId,applicationDeadline:day,cancellationPolicy:"返金不可",bankInformation:"",status:"PUBLISHED"}})).id;
  }
  let n=0;
  async function register(eventId:string,name:string,claimed=true){
    const p=await db.participant.create({data:{name,nameKana:"テスト",phone:`090${String(3e7+(++n)*53).padStart(8,"0")}`,email:`pf${n}-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}});
    const t=await db.ticket.create({data:{eventId,participantId:p.id,ticketNumber:`PF-${run}-${n}`,qrTokenHash:randomUUID(),claimed}});
    if(claimed)await db.eventRegistration.create({data:{eventId,participantId:p.id,ticketId:t.id,applicationSource:"WEB"}});
  }
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url});({db}=await import("@/server/db"));data=await import("@/features/participants/admin-data");
    const mk=async(key:string,role:"SUPER_ADMIN"|"EVENT_MANAGER")=>{const x=await db.user.create({data:{name:`${key}-${run}`,email:`${key}-${run}@example.com`,role}});u[key]={id:x.id,role}};
    await Promise.all([mk("admin","SUPER_ADMIN"),mk("mgrA","EVENT_MANAGER"),mk("mgrB","EVENT_MANAGER")]);
    evA=await mkEvent("イベントA",u.mgrA.id,10);evB=await mkEvent("イベントB",u.mgrB.id,20);evC=await mkEvent("イベントC",u.mgrA.id,5);
    await register(evA,`A太郎-${run}`);await register(evA,`A花子-${run}`);await register(evB,`B次郎-${run}`);
  });
  afterAll(async()=>{await db?.$disconnect()});
  const names=async(user:{id:string;role:"SUPER_ADMIN"|"EVENT_MANAGER"},q?:string,eventId?:string)=>(await data.listParticipants(user,q??`-${run}`,eventId)).map(r=>r.name).sort();

  it("イベントを指定しなければ全イベント、指定するとそのイベントの参加者だけになる",async()=>{
    expect(await names(u.admin)).toEqual([`A太郎-${run}`,`A花子-${run}`,`B次郎-${run}`]);
    expect(await names(u.admin,undefined,evA)).toEqual([`A太郎-${run}`,`A花子-${run}`]);
    expect(await names(u.admin,undefined,evB)).toEqual([`B次郎-${run}`]);
    expect(await names(u.admin,undefined,evC)).toEqual([]);
  });
  it("検索語との組み合わせでも、選んだイベントの中だけを検索する",async()=>{
    expect(await names(u.admin,`B次郎-${run}`,evA)).toEqual([]);
    expect(await names(u.admin,`A花子-${run}`,evA)).toEqual([`A花子-${run}`]);
  });
  it("担当者は自分のイベントしか見られない。他人のイベントを指定しても何も見えない",async()=>{
    expect(await names(u.mgrA)).toEqual([`A太郎-${run}`,`A花子-${run}`]);
    expect(await names(u.mgrA,undefined,evB)).toEqual([]);
    expect(await names(u.mgrB,undefined,evB)).toEqual([`B次郎-${run}`]);
    expect(await names(u.mgrB,undefined,evA)).toEqual([]);
  });
  it("切り替えの選択肢は、見られるイベントだけを開催日の新しい順に、申込件数つきで返す",async()=>{
    const mine=(await data.listEventOptions(u.mgrA)).filter(o=>o.name.endsWith(run));
    expect(mine.map(o=>[o.name,o.count])).toEqual([[`イベントA-${run}`,2],[`イベントC-${run}`,0]]);
    expect((await data.listEventOptions(u.mgrB)).filter(o=>o.name.endsWith(run)).map(o=>o.name)).toEqual([`イベントB-${run}`]);
    expect((await data.listEventOptions(u.admin)).filter(o=>o.name.endsWith(run)).map(o=>o.name)).toEqual([`イベントB-${run}`,`イベントA-${run}`,`イベントC-${run}`]);
  });
  it("未配布チケットの一覧もイベントで絞り込める",async()=>{
    const buyer=await db.participant.create({data:{name:`購入者-${run}`,nameKana:"コウニュウ",phone:`090${String(4e7+n*7).padStart(8,"0")}`,email:`buyer-${run}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}});
    const order=await db.ticketOrder.create({data:{eventId:evA,buyerParticipantId:buyer.id,quantity:2}});
    await db.ticket.create({data:{eventId:evA,participantId:buyer.id,orderId:order.id,ticketNumber:`PFU-${run}`,qrTokenHash:randomUUID(),claimed:false}});
    expect((await data.listUnclaimedTickets(u.admin,`PFU-${run}`,evA)).map(t=>t.ticketNumber)).toEqual([`PFU-${run}`]);
    expect(await data.listUnclaimedTickets(u.admin,`PFU-${run}`,evB)).toEqual([]);
  });
});
