import {Prisma} from "@prisma/client";
import {db} from "@/server/db";
import {retryTransient} from "@/server/transient";
import {parseJstDateTime} from "@/lib/jst";
import {canManageRoster,loadRosterEvent,resolveRosterActor,type Actor} from "./backfill-service";
import {normalizeReason} from "./edit-domain";
import {parseDay} from "./backfill-domain";
import {normalizeName} from "@/features/transfers/holder";

export type EventResult={ok:true;eventId:string}|{ok:false;error:string};
const validName=(raw:unknown)=>{const n=normalizeName(typeof raw==="string"?raw:"");return n.length>=2&&n.length<=120?n:null};
export const PAST_EVENT_CATEGORY="過去の記録";

/** 帳簿から過去のイベントを追加する(まだシステムにない月のイベント用)。状態は「終了」。公開されず、申込・通知も出ない。
 *  追加できる人: システム管理者・イベント管理者。そのまま参加者の入力に進める。 */
export async function createPastEvent(user:Actor,input:{name:unknown;day:unknown;price:unknown;venue?:unknown;startTime?:unknown}):Promise<EventResult>{
  const who=await resolveRosterActor(db,user);
  if(who.role!=="SUPER_ADMIN"&&who.role!=="EVENT_MANAGER")return {ok:false,error:"forbidden"};
  const name=validName(input.name);if(!name)return {ok:false,error:"invalid_name"};
  const day=typeof input.day==="string"?parseDay(input.day,new Date().getFullYear()):null;if(!day)return {ok:false,error:"invalid_date"};
  const priceText=String(input.price??"").normalize("NFKC").replace(/[,，円¥￥\s]/g,"");
  const price=priceText===""?0:Number(priceText);if(!Number.isSafeInteger(price)||price<0||price>100_000_000)return {ok:false,error:"invalid_price"};
  const venue=normalizeName(String(input.venue??"")).slice(0,160)||"（過去の記録）";
  const time=typeof input.startTime==="string"&&/^\d{2}:\d{2}$/.test(input.startTime)&&+input.startTime.slice(0,2)<24&&+input.startTime.slice(3)<60?input.startTime:"18:00";
  const start=parseJstDateTime(`${day}T${time}`);
  const event=await retryTransient(()=>db.$transaction(async tx=>{
    const category=await tx.eventCategory.findFirst({where:{name:PAST_EVENT_CATEGORY}})??await tx.eventCategory.create({data:{name:PAST_EVENT_CATEGORY,slug:`past-records-${Date.now().toString(36)}`}});
    const created=await tx.event.create({data:{categoryId:category.id,name,description:"過去の記録として追加したイベントです。",eventDate:parseJstDateTime(day),startTime:start,receptionStartTime:new Date(start.getTime()-30*60_000),endTime:new Date(start.getTime()+2*3600_000),venueName:venue,address:"（過去の記録）",capacity:1000,price,organizer:"（過去の記録）",applicationDeadline:start,cancellationPolicy:"過去の記録のため対象外",bankInformation:"",status:"CLOSED",managerId:who.id}});
    await tx.auditLog.create({data:{actorId:who.id,action:"PAST_EVENT_CREATED",entityType:"Event",entityId:created.id,after:{name,day,price}}});
    return created;
  }));
  return {ok:true,eventId:event.id};
}

/** イベント名の変更。理由必須。変更前後・理由・直した人は監査ログ(EVENT_RENAMED)に残る。システム管理者・そのイベントの管理者だけ。 */
export async function renameEvent(user:Actor,input:{eventId:string;name:unknown;reason:unknown}):Promise<EventResult>{
  const reason=normalizeReason(input.reason);if(!reason.ok)return {ok:false,error:reason.error};
  const name=validName(input.name);if(!name)return {ok:false,error:"invalid_name"};
  const who=await resolveRosterActor(db,user);
  const event=await loadRosterEvent(db,input.eventId);
  if(!event)return {ok:false,error:"not_found"};
  if(!canManageRoster(who,event))return {ok:false,error:"forbidden"};
  try{
    await retryTransient(()=>db.$transaction(async tx=>{
      const cur=await tx.event.findUnique({where:{id:event.id},select:{name:true}});
      if(!cur)throw new Error("NOT_FOUND");
      if(cur.name===name)throw new Error("NO_CHANGE");
      await tx.event.update({where:{id:event.id},data:{name}});
      await tx.auditLog.create({data:{actorId:who.id,action:"EVENT_RENAMED",entityType:"Event",entityId:event.id,before:{name:cur.name},after:{name,reason:reason.reason}}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
    return {ok:true,eventId:event.id};
  }catch(e){
    if(e instanceof Error&&e.message==="NO_CHANGE")return {ok:false,error:"no_change"};
    if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==="P2034")return {ok:false,error:"conflict"};
    throw e;
  }
}
export type NameHistoryRow={id:string;at:Date;editor:string|null;before:string;after:string;reason:string};
export async function listEventRenames(eventId:string,take=30):Promise<NameHistoryRow[]>{
  const rows=await db.auditLog.findMany({where:{action:"EVENT_RENAMED",entityType:"Event",entityId:eventId},orderBy:{createdAt:"desc"},take,include:{actor:{select:{name:true}}}});
  return rows.map(r=>({id:r.id,at:r.createdAt,editor:r.actor?.name??null,before:String((r.before as {name?:string}|null)?.name??""),after:String((r.after as {name?:string}|null)?.name??""),reason:String((r.after as {reason?:string}|null)?.reason??"")}));
}
