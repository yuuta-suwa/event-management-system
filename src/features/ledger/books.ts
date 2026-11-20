import {db} from "@/server/db";
import {exitReasonLabel} from "@/features/checkins/exit-domain";
import {ledgerEventScope} from "./access";
import {eventTicketBook,jstMonth,periodRange,summarizeBook,type Attendee,type EventBook} from "./book-domain";

export type BookView={year:number;month?:number;events:EventBook[];summary:ReturnType<typeof summarizeBook>;attendees:Attendee[]};
/** 年次・月次の帳簿。閲覧者が帳簿を扱えるイベント(管理者は全て・イベント管理者は担当分・決裁権者は指定分)だけを集計する。
 *  month を指定すると、そのイベントの参加者履歴(参加者名・受付時刻・退出)も返す。電話番号・メールアドレスは含めない。 */
export async function loadBook(user:{id:string;role:string},year:number,month?:number):Promise<BookView>{
  const {start,end}=periodRange(year,month);
  const rows=await db.event.findMany({where:{...ledgerEventScope(user),eventDate:{gte:start,lt:end}},select:{id:true,name:true,eventDate:true,price:true,capacity:true,managerId:true,tickets:{select:{status:true,paymentStatus:true,checkin:{select:{id:true}},payments:{orderBy:{createdAt:"desc"},take:1,select:{amount:true}}}}},orderBy:{eventDate:"asc"},take:500});
  const events:EventBook[]=rows.map(e=>{
    const b=eventTicketBook(e.price,e.tickets.map(t=>({status:t.status,paymentStatus:t.paymentStatus,amount:t.payments[0]?.amount??e.price,attended:Boolean(t.checkin)})));
    return {id:e.id,name:e.name,date:e.eventDate,month:jstMonth(e.eventDate),price:e.price,capacity:e.capacity,canEdit:user.role==="SUPER_ADMIN"||(user.role==="EVENT_MANAGER"&&e.managerId===user.id),...b};
  });
  let attendees:Attendee[]=[];
  if(month&&events.length){
    const tickets=await db.ticket.findMany({where:{eventId:{in:events.map(e=>e.id)},claimed:true,status:{notIn:["CANCELLED","EXPIRED"]},paymentStatus:{notIn:["CANCELLED","REFUNDED"]}},select:{eventId:true,ticketNumber:true,paymentStatus:true,registration:{select:{id:true}},participant:{select:{name:true,nameKana:true}},checkin:{select:{checkedInAt:true}},checkouts:{orderBy:{checkedOutAt:"desc"},take:1,select:{checkedOutAt:true,reasonCode:true,reasonNote:true}}},orderBy:[{participant:{nameKana:"asc"}},{ticketNumber:"asc"}]});
    attendees=tickets.map(t=>({registrationId:t.registration?.id??null,eventId:t.eventId,name:t.participant.name,nameKana:t.participant.nameKana,ticketNumber:t.ticketNumber,paymentStatus:t.paymentStatus,checkedInAt:t.checkin?.checkedInAt??null,exitedAt:t.checkouts[0]?.checkedOutAt??null,exitReason:t.checkouts[0]?exitReasonLabel(t.checkouts[0].reasonCode)+(t.checkouts[0].reasonNote?`（${t.checkouts[0].reasonNote}）`:""):null}));
  }
  return {year,month,events,summary:summarizeBook(events),attendees};
}
