import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
vi.mock("@/server/authz",()=>({isLocalDemo:()=>false,requireUser:async()=>{throw new Error("UNUSED")}}));
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url&&/@(localhost|127\.0\.0\.1)[:/]/.test(url));
describe.skipIf(!enabled)("通知ジョブ処理の期限切れガード（実DB）",()=>{
  let db:typeof import("@/server/db").db;let svc:typeof import("@/features/notifications/service");let pushes:string[]=[];const realFetch=globalThis.fetch;
  const ids={past:"",future:"",participantA:"",participantB:""};
  beforeAll(async()=>{
    Object.assign(process.env,{DATABASE_URL:url,QR_TOKEN_SECRET:"t".repeat(48),LINE_MESSAGING_ACCESS_TOKEN:"token",NEXT_PUBLIC_APP_URL:"https://app.example.com"});
    ({db}=await import("@/server/db"));svc=await import("@/features/notifications/service");
    const manager=await db.user.create({data:{name:"m",email:`m-${randomUUID()}@example.com`,role:"EVENT_MANAGER"}});
    const category=await db.eventCategory.create({data:{name:`G-${randomUUID().slice(0,6)}`,slug:`g-${randomUUID()}`}});
    const mkEvent=async(name:string,startOffsetDays:number)=>{const start=new Date(Date.now()+startOffsetDays*86400000);return (await db.event.create({data:{categoryId:category.id,name,description:"テスト用イベントです。",eventDate:start,startTime:start,receptionStartTime:start,endTime:new Date(start.getTime()+3600000),venueName:"会場",address:"住所",capacity:10,price:1000,organizer:"主催",managerId:manager.id,applicationDeadline:start,cancellationPolicy:"x",bankInformation:"",status:"PUBLISHED",lineNotifications:true}})).id};
    ids.past=await mkEvent("開催済み",-14);ids.future=await mkEvent("これから",+3);
    const mkP=async(key:string)=>{const p=await db.participant.create({data:{name:`${key} 太郎`,nameKana:"タロウ",phone:`090${Math.floor(Math.random()*1e8).toString().padStart(8,"0")}`,email:`${key}-${randomUUID()}@example.com`,lineLinkCode:randomUUID().replace(/-/g,"").slice(0,8).toUpperCase(),lineUserId:`U${randomUUID().replace(/-/g,"")}`,lineConnected:true}});return p.id};
    ids.participantA=await mkP("a");ids.participantB=await mkP("b");
    for(const [eventId,participantId] of [[ids.past,ids.participantA],[ids.future,ids.participantB]] as const)await db.eventRegistration.create({data:{eventId,participantId,applicationSource:"WEB"}});
    globalThis.fetch=(async(_i:RequestInfo|URL,init?:RequestInit)=>{pushes.push(String(init?.body??""));return new Response("{}",{status:200})}) as typeof fetch;
  });
  afterAll(async()=>{globalThis.fetch=realFetch;await db?.$disconnect()});
  it("開催済みイベントの当日通知は送らず取消し、これから開催のイベントの通知と申込通知は送る",async()=>{
    pushes=[];
    const stale=await db.notificationJob.create({data:{eventId:ids.past,type:"EVENT_DAY_OF",scheduledAt:new Date(Date.now()-13*86400000),payload:{participantId:ids.participantA}}});
    const lateApplication=await db.notificationJob.create({data:{eventId:ids.past,type:"APPLICATION",scheduledAt:new Date(Date.now()-13*86400000),payload:{participantId:ids.participantA}}});
    const valid=await db.notificationJob.create({data:{eventId:ids.future,type:"EVENT_EVE",scheduledAt:new Date(Date.now()-60000),payload:{participantId:ids.participantB}}});
    const result=await svc.processDueNotificationJobs(500);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect((await db.notificationJob.findUniqueOrThrow({where:{id:stale.id}})).status).toBe("CANCELLED");
    expect((await db.notificationJob.findUniqueOrThrow({where:{id:valid.id}})).status).toBe("SENT");
    expect((await db.notificationJob.findUniqueOrThrow({where:{id:lateApplication.id}})).status).toBe("SENT");
    const a=await db.participant.findUniqueOrThrow({where:{id:ids.participantA}});
    const sentToA=pushes.map(b=>JSON.parse(b)).filter(b=>b.to===a.lineUserId).map(b=>b.messages[0].text as string);
    expect(sentToA).toHaveLength(1);expect(sentToA[0]).toContain("お申し込み");expect(sentToA.join("")).not.toContain("本日は");
    expect(await db.notificationLog.count({where:{participantId:ids.participantA,type:"EVENT_DAY_OF"}})).toBe(0);
  });
});
