"use server";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
import {retryTransient} from "@/server/transient";
import {hashTicketToken,issueTicketToken,qrTokenSecret} from "@/features/tickets/token";
import {kickEmailDelivery,queueTicketEmail} from "@/features/email/service";
import {canTransferTicket,nextQrVersion} from "./domain";
import {moveRegistration} from "./move-registration";
import {parseTransferInput,transferErrorMessages} from "./holder";
import {generateLineLinkCode} from "@/features/participants/line-link-code";
export type TransferState={message?:string;errors?:Record<string,string>;values?:Record<string,string>};
const KEYS=["ticketId","name","nameKana","phone","email","reason"] as const;
const keep=(f:FormData)=>Object.fromEntries(KEYS.map(k=>[k,String(f.get(k)??"")]));
/** 管理者による名義変更。失敗しても画面は落とさず、原因を日本語で返す(入力値も保持)。一時的なDBエラーは自動で再試行する。 */
export async function transferTicket(_:TransferState,formData:FormData):Promise<TransferState>{
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const values=keep(formData);
  const parsed=parseTransferInput(Object.fromEntries(formData));
  if(!parsed.ok)return {message:"入力内容を確認してください。",errors:parsed.errors,values};
  if(isLocalDemo())redirect("/transfers?notice=demo");
  const i=parsed.value;
  try{
    await retryTransient(async()=>{
      const ticket=await db.ticket.findUnique({where:{id:i.ticketId},include:{event:true,checkin:true}});
      if(!ticket)throw new Error("TICKET_NOT_FOUND");
      if(user.role!=="SUPER_ADMIN"&&ticket.event.managerId!==user.id)throw new Error("FORBIDDEN");
      if(!canTransferTicket({status:ticket.status,hasCheckin:Boolean(ticket.checkin)}))throw new Error("TICKET_NOT_TRANSFERABLE");
      const version=nextQrVersion(ticket.qrTokenVersion);
      const newToken=issueTicketToken(ticket.id,version,qrTokenSecret());
      await db.$transaction(async tx=>{
        // メール・電話のどちらかが一致する既存の参加者を優先して使い、無ければ作成する
        // メールアドレスが一致する人を最優先(家族などで電話番号を共有していても取り違えない)。無ければ電話番号で探す
        const existing=await tx.participant.findFirst({where:{email:i.email},orderBy:{createdAt:"asc"}})??await tx.participant.findFirst({where:{phone:i.phone},orderBy:{createdAt:"asc"}});
        const participant=existing??await tx.participant.create({data:{name:i.name,nameKana:i.nameKana,phone:i.phone,email:i.email,lineLinkCode:generateLineLinkCode()}});
        if(participant.id===ticket.participantId)throw new Error("SAME_HOLDER");
        const taken=await tx.eventRegistration.findUnique({where:{eventId_participantId:{eventId:ticket.eventId,participantId:participant.id}}});
        if(taken?.ticketId&&taken.ticketId!==ticket.id&&taken.attendanceStatus!=="CANCELLED")throw new Error("ALREADY_REGISTERED");
        const transfer=await tx.ticketTransfer.create({data:{ticketId:ticket.id,oldParticipantId:ticket.participantId,newParticipantId:participant.id,transferredBy:user.id,source:"ADMIN",reason:i.reason,oldQrTokenHash:ticket.qrTokenHash}});
        // 取消・受付・別の譲渡と同時に起きた場合は、巻き戻して案内する
        const swapped=await tx.ticket.updateMany({where:{id:ticket.id,qrTokenVersion:ticket.qrTokenVersion,status:{notIn:["CANCELLED","USED","EXPIRED"]}},data:{participantId:participant.id,qrTokenVersion:version,qrTokenHash:hashTicketToken(newToken),receptionCode:null,receptionCodeIssuedAt:null,transferredAt:new Date()}});
        if(swapped.count!==1)throw new Error("TICKET_CHANGED");
        await moveRegistration(tx,{ticketId:ticket.id,eventId:ticket.eventId,toParticipantId:participant.id});
        // 新しい保有者へ、新しいQRのチケットメールを送る(入金済みの場合のみQR付き。未入金なら案内のみ)
        await queueTicketEmail(tx,{kind:"TRANSFER_RECEIVED",ticketId:ticket.id,triggeredBy:user.id});
        await tx.auditLog.create({data:{actorId:user.id,action:"TICKET_TRANSFERRED",entityType:"TicketTransfer",entityId:transfer.id,before:{participantId:ticket.participantId,qrTokenVersion:ticket.qrTokenVersion},after:{participantId:participant.id,qrTokenVersion:version,paymentStatus:ticket.paymentStatus}}});
      });
    });
  }catch(error){
    const code=error instanceof Error?error.message:"";
    if(code in transferErrorMessages)return {message:transferErrorMessages[code],values};
    console.error("[transferTicket]",error);
    return {message:"譲渡を完了できませんでした。通信が混み合っている可能性があります。入力は残してあるので、もう一度「譲渡」を押してください。",values};
  }
  kickEmailDelivery();
  revalidatePath("/transfers");
  redirect("/transfers?notice=success");
}
