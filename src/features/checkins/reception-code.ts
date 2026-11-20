import {randomInt} from "node:crypto";
import {Prisma} from "@prisma/client";
import {db} from "@/server/db";

// 受付コード: イベント内で一意の6桁。保有者が替わる(QR再発行)たびに失効し、次の表示時に新しく発行される。
export function generateReceptionCode(){return String(randomInt(0,1_000_000)).padStart(6,"0")}
export function normalizeReceptionCode(raw:string){
  const digits=raw.normalize("NFKC").replace(/[\s\-ー－]/g,"");
  return /^\d{6}$/.test(digits)?digits:null;
}
export function formatReceptionCode(code:string){return `${code.slice(0,3)} ${code.slice(3)}`}

type Client=Pick<typeof db,"ticket">|Prisma.TransactionClient;
/** チケットに受付コードがなければ発行して返す(重複時は再試行)。受付済み・取消済みには発行しない。 */
export async function ensureReceptionCode(ticketId:string,client:Client=db):Promise<string|null>{
  const ticket=await client.ticket.findUnique({where:{id:ticketId},select:{id:true,eventId:true,status:true,receptionCode:true,checkin:{select:{id:true}}}});
  if(!ticket||ticket.status==="CANCELLED")return null;
  if(ticket.receptionCode)return ticket.receptionCode;
  for(let attempt=0;attempt<12;attempt++){
    const code=generateReceptionCode();
    try{
      const updated=await client.ticket.updateMany({where:{id:ticket.id,receptionCode:null},data:{receptionCode:code,receptionCodeIssuedAt:new Date()}});
      if(updated.count===1)return code;
      const current=await client.ticket.findUnique({where:{id:ticket.id},select:{receptionCode:true}});
      if(current?.receptionCode)return current.receptionCode;
    }catch(error){
      if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")continue;
      throw error;
    }
  }
  throw new Error("RECEPTION_CODE_EXHAUSTED");
}

/** イベント内で受付コード未発行の有効チケットにまとめて発行する(受付画面を開いたとき)。 */
export async function ensureEventReceptionCodes(eventId:string){
  const tickets=await db.ticket.findMany({where:{eventId,receptionCode:null,status:{not:"CANCELLED"}},select:{id:true},take:2000});
  let issued=0;
  for(const t of tickets){if(await ensureReceptionCode(t.id))issued++}
  return issued;
}

/** 受付コードの総当たり対策: 操作者ごとの失敗回数(監査ログにコードは保存しない)。 */
export const CODE_FAILURE_LIMIT=15;
export const CODE_FAILURE_WINDOW_MS=10*60*1000;
export async function recentCodeFailures(operatorId:string,now=Date.now()){
  return db.auditLog.count({where:{actorId:operatorId,action:"RECEPTION_CODE_FAILED",createdAt:{gte:new Date(now-CODE_FAILURE_WINDOW_MS)}}});
}
export async function recordCodeFailure(operatorId:string,eventId:string){
  await db.auditLog.create({data:{actorId:operatorId,action:"RECEPTION_CODE_FAILED",entityType:"Event",entityId:eventId}});
}
