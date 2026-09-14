import type { EventStatus, UserRole } from "@prisma/client";
import { db } from "@/server/db";
import { isLocalDemo } from "@/server/authz";

export type EventSummary = {
  id:string; name:string; categoryName:string; eventDate:Date; startTime:Date; endTime:Date;
  venueName:string; address:string; capacity:number; price:number; status:EventStatus;
  registrationCount:number; paidCount:number;
};
export type EventDetail = EventSummary & {
  categoryId:string; description:string; receptionStartTime:Date; organizer:string;
  applicationDeadline:Date; cancelDeadline:Date|null; cancellationPolicy:string;
  bankInformation:string; lineNotifications:boolean; managerId:string;
};

const demoEvent: EventDetail = {
  id:"demo-autumn-2026", name:"秋のビジネス交流会 2026", categoryName:"イベント", categoryId:"demo-event",
  description:"業界を越えた交流と新しい協業のきっかけをつくる、少人数制のビジネス交流会です。",
  eventDate:new Date("2026-09-12T00:00:00+09:00"), startTime:new Date("2026-09-12T18:00:00+09:00"),
  receptionStartTime:new Date("2026-09-12T17:30:00+09:00"), endTime:new Date("2026-09-12T20:30:00+09:00"),
  venueName:"丸の内コンファレンスホール", address:"東京都千代田区丸の内1-1-1", capacity:30, price:5000,
  status:"PUBLISHED", registrationCount:24, paidCount:19, organizer:"EVENT MANAGEMENT事務局",
  applicationDeadline:new Date("2026-09-10T23:59:00+09:00"), cancelDeadline:new Date("2026-09-05T23:59:00+09:00"),
  cancellationPolicy:"チケット取得後は返金不可。主催者都合による中止の場合のみ返金します。",
  bankInformation:"イベント専用口座（申込完了後に参加者へ案内）", lineNotifications:true, managerId:"local-demo-super-admin",
};

export async function listCategories() {
  if (isLocalDemo()) return [{id:"demo-event",name:"イベント"},{id:"demo-seminar",name:"セミナー"}];
  return db.eventCategory.findMany({ where:{active:true}, orderBy:{name:"asc"}, select:{id:true,name:true} });
}

export async function listEvents(user:{id:string;role:UserRole}):Promise<EventSummary[]> {
  if (isLocalDemo()) return [demoEvent];
  const rows=await db.event.findMany({
    where:user.role==="SUPER_ADMIN"?{}:{OR:[{managerId:user.id},{staff:{some:{userId:user.id}}}]},
    orderBy:[{eventDate:"asc"},{startTime:"asc"}], include:{category:true,_count:{select:{registrations:true}},tickets:{select:{paymentStatus:true}}},
  });
  return rows.map(e=>({...e,categoryName:e.category.name,registrationCount:e._count.registrations,paidCount:e.tickets.filter(t=>t.paymentStatus==="PAID").length}));
}

export async function getEvent(id:string,user:{id:string;role:UserRole}):Promise<EventDetail|null> {
  if (isLocalDemo()) return id===demoEvent.id?demoEvent:null;
  const e=await db.event.findFirst({where:{id,...(user.role==="SUPER_ADMIN"?{}:{OR:[{managerId:user.id},{staff:{some:{userId:user.id}}}]})},include:{category:true,_count:{select:{registrations:true}},tickets:{select:{paymentStatus:true}}}});
  return e?{...e,categoryName:e.category.name,registrationCount:e._count.registrations,paidCount:e.tickets.filter(t=>t.paymentStatus==="PAID").length}:null;
}
