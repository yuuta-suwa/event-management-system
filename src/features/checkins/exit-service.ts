import {Prisma} from "@prisma/client";
import {db} from "@/server/db";
import {canAccessEvent} from "@/server/permissions";
import {hashTicketToken,verifyTicketToken} from "@/features/tickets/token";
import {decideExitGate,exitReasonLabel,normalizeExitReason} from "./exit-domain";
import {CODE_FAILURE_LIMIT,normalizeReceptionCode,recentCodeFailures,recordCodeFailure} from "./reception-code";
import {loadTicketForCheckin,type CheckinMethod,type CheckinResult,type LoadedTicket,type Operator} from "./service";

type Reason={code:string;note?:string|null};
const describe=(t:LoadedTicket)=>({participantName:t.participant.name,eventName:t.event.name,ticketNumber:t.ticketNumber,ticketId:t.id});
const ACTION:Record<CheckinMethod,string>={QR:"QR_CHECKOUT",RECEPTION_CODE:"RECEPTION_CODE_CHECKOUT",NAME_SEARCH:"NAME_SEARCH_CHECKOUT"};
const exitFields=(c:{id:string;checkedOutAt:Date;reasonCode:string;reasonNote:string|null;operator?:{name:string}|null})=>({checkoutId:c.id,exitedAt:c.checkedOutAt.toISOString(),exitedBy:c.operator?.name,exitReasonCode:c.reasonCode,exitReason:exitReasonLabel(c.reasonCode),exitNote:c.reasonNote});
const allowed=(operator:Operator,t:LoadedTicket)=>canAccessEvent({role:operator.role,userId:operator.id,managerId:t.event.managerId,assignedUserIds:t.event.staff.map(s=>s.userId)});

/** 3方式(QR/受付コード/参加者検索)共通の退出確定処理。受付済みの人だけが退出でき、理由を必ず記録する。 */
export async function finalizeCheckout(ticket:LoadedTicket,ctx:{operator:Operator;method:CheckinMethod;eventId?:string;reason:Reason}):Promise<CheckinResult>{
  const {operator,method}=ctx;
  if(!allowed(operator,ticket))return {kind:"FORBIDDEN",message:"このイベントを操作する権限がありません"};
  const reason=normalizeExitReason(ctx.reason.code,ctx.reason.note);
  if(!reason.ok)return {kind:"INVALID",...describe(ticket),message:reason.message};
  const open=await db.checkout.findFirst({where:{ticketId:ticket.id,returnedAt:null},include:{operator:{select:{name:true}}},orderBy:{checkedOutAt:"desc"}});
  const gate=decideExitGate({valid:ticket.status!=="CANCELLED",sameEvent:!ctx.eventId||ticket.eventId===ctx.eventId,hasCheckin:Boolean(ticket.checkin),exited:Boolean(open)});
  if(gate==="INVALID")return {kind:"INVALID",message:"チケットが無効です"};
  if(gate==="WRONG_EVENT")return {kind:"WRONG_EVENT",...describe(ticket),message:"別イベントのチケットです"};
  if(gate==="NOT_CHECKED_IN")return {kind:"NOT_CHECKED_IN",...describe(ticket),message:"まだ受付していないため、退出は記録できません"};
  if(gate==="ALREADY_EXITED")return {kind:"ALREADY_EXITED",...describe(ticket),...exitFields(open!),message:"すでに退出済みです"};
  try{
    const created=await db.$transaction(async tx=>{
      const row=await tx.checkout.create({data:{eventId:ticket.eventId,ticketId:ticket.id,participantId:ticket.participantId,checkedOutBy:operator.id,checkoutType:method,reasonCode:reason.code,reasonNote:reason.note},include:{operator:{select:{name:true}}}});
      await tx.auditLog.create({data:{actorId:operator.id,action:ACTION[method],entityType:"Checkout",entityId:row.id,after:{ticketId:ticket.id,eventId:ticket.eventId,method,reason:reason.code,note:reason.note}}});
      return row;
    });
    return {kind:"EXIT_OK",...describe(ticket),...exitFields(created),message:"退出を記録しました"};
  }catch(error){
    // 同時に2か所で読み取られた場合(部分一意インデックスに衝突): 先に記録された方を「退出済み」として返す
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002"){
      const existing=await db.checkout.findFirst({where:{ticketId:ticket.id,returnedAt:null},include:{operator:{select:{name:true}}}});
      if(existing)return {kind:"ALREADY_EXITED",...describe(ticket),...exitFields(existing),message:"すでに退出済みです"};
    }
    throw error;
  }
}

/** ① QRで退出 */
export async function processCheckoutByQr(input:{token:string;eventId?:string;operator:Operator;reason:Reason}):Promise<CheckinResult>{
  const verified=verifyTicketToken(input.token,process.env.QR_TOKEN_SECRET??"");
  if(!verified)return {kind:"INVALID",message:"QRコードが無効です"};
  const ticket=await loadTicketForCheckin({id:verified.ticketId});
  if(!ticket||ticket.qrTokenVersion!==verified.version||ticket.qrTokenHash!==hashTicketToken(input.token))return {kind:"INVALID",message:"チケットが無効です"};
  return finalizeCheckout(ticket,{operator:input.operator,method:"QR",eventId:input.eventId,reason:input.reason});
}
/** ② 受付コードで退出(入力ミスの回数制限は受付と共通) */
export async function processCheckoutByCode(input:{eventId:string;code:string;operator:Operator;reason:Reason}):Promise<CheckinResult>{
  const code=normalizeReceptionCode(input.code);
  if(!code)return {kind:"INVALID",message:"受付コードは6桁の数字です"};
  if(await recentCodeFailures(input.operator.id)>=CODE_FAILURE_LIMIT)return {kind:"LOCKED",message:"受付コードの入力ミスが続いたため、しばらく待ってから再試行してください"};
  const ticket=await loadTicketForCheckin({eventId_receptionCode:{eventId:input.eventId,receptionCode:code}});
  if(!ticket||ticket.status==="CANCELLED"){await recordCodeFailure(input.operator.id,input.eventId);return {kind:"INVALID",message:"受付コードが見つかりません"}}
  return finalizeCheckout(ticket,{operator:input.operator,method:"RECEPTION_CODE",eventId:input.eventId,reason:input.reason});
}
/** ③ 参加者検索で退出(候補から選ぶ。受付済みの人だけが対象) */
export async function processCheckoutBySearch(input:{eventId:string;ticketId:string;operator:Operator;reason:Reason}):Promise<CheckinResult>{
  const ticket=await loadTicketForCheckin({id:input.ticketId});
  if(!ticket||ticket.eventId!==input.eventId||ticket.status==="CANCELLED")return {kind:"INVALID",message:"対象の参加者が見つかりません"};
  return finalizeCheckout(ticket,{operator:input.operator,method:"NAME_SEARCH",eventId:input.eventId,reason:input.reason});
}

/** 再入場: 退出中の記録に戻った時刻を残す(退出の履歴そのものは消さない)。 */
export async function recordReentry(input:{ticketId:string;eventId?:string;operator:Operator}):Promise<CheckinResult>{
  const ticket=await loadTicketForCheckin({id:input.ticketId});
  if(!ticket||(input.eventId&&ticket.eventId!==input.eventId))return {kind:"INVALID",message:"対象の参加者が見つかりません"};
  if(!allowed(input.operator,ticket))return {kind:"FORBIDDEN",message:"このイベントを操作する権限がありません"};
  const open=await db.checkout.findFirst({where:{ticketId:ticket.id,returnedAt:null},orderBy:{checkedOutAt:"desc"}});
  if(!open)return {kind:"INVALID",...describe(ticket),message:"退出中の記録がありません"};
  const now=new Date();
  const moved=await db.checkout.updateMany({where:{id:open.id,returnedAt:null},data:{returnedAt:now,returnedBy:input.operator.id}});
  if(moved.count!==1)return {kind:"INVALID",...describe(ticket),message:"すでに再入場として記録されています"};
  await db.auditLog.create({data:{actorId:input.operator.id,action:"CHECKOUT_REENTERED",entityType:"Checkout",entityId:open.id,after:{ticketId:ticket.id,returnedAt:now.toISOString()}}});
  return {kind:"REENTER_OK",...describe(ticket),checkoutId:open.id,exitedAt:open.checkedOutAt.toISOString(),message:"再入場を記録しました"};
}

/** 理由の後から修正(読み取り直後に「理由を変更」する用途)。履歴はAuditLogにも残す。 */
export async function updateCheckoutReason(input:{checkoutId:string;operator:Operator;reason:Reason}):Promise<CheckinResult>{
  const reason=normalizeExitReason(input.reason.code,input.reason.note);
  if(!reason.ok)return {kind:"INVALID",message:reason.message};
  const row=await db.checkout.findUnique({where:{id:input.checkoutId},include:{ticket:{include:{participant:true,event:{include:{staff:{select:{userId:true}}}},checkin:{include:{operator:true}}}},operator:{select:{name:true}}}});
  if(!row)return {kind:"INVALID",message:"退出の記録が見つかりません"};
  if(!allowed(input.operator,row.ticket))return {kind:"FORBIDDEN",message:"このイベントを操作する権限がありません"};
  const updated=await db.$transaction(async tx=>{
    const next=await tx.checkout.update({where:{id:row.id},data:{reasonCode:reason.code,reasonNote:reason.note},include:{operator:{select:{name:true}}}});
    await tx.auditLog.create({data:{actorId:input.operator.id,action:"CHECKOUT_REASON_UPDATED",entityType:"Checkout",entityId:row.id,before:{reason:row.reasonCode,note:row.reasonNote},after:{reason:reason.code,note:reason.note}}});
    return next;
  });
  return {kind:"EXIT_OK",...describe(row.ticket),...exitFields(updated),message:"理由を更新しました"};
}

export type ExitHistoryRow={id:string;ticketNumber:string;name:string;exitedAt:Date;reasonCode:string;reasonNote:string|null;operatorName:string;returnedAt:Date|null;method:string};
/** 退出履歴(新しい順)。イベントの権限がある人だけ。 */
export async function listExitHistory(input:{eventId:string;operator:Operator;limit?:number}):Promise<ExitHistoryRow[]|"FORBIDDEN">{
  const event=await db.event.findUnique({where:{id:input.eventId},select:{managerId:true,staff:{select:{userId:true}}}});
  if(!event||!canAccessEvent({role:input.operator.role,userId:input.operator.id,managerId:event.managerId,assignedUserIds:event.staff.map(s=>s.userId)}))return "FORBIDDEN";
  const rows=await db.checkout.findMany({where:{eventId:input.eventId},include:{ticket:{select:{ticketNumber:true}},participant:{select:{name:true}},operator:{select:{name:true}}},orderBy:{checkedOutAt:"desc"},take:input.limit??100});
  return rows.map(r=>({id:r.id,ticketNumber:r.ticket.ticketNumber,name:r.participant.name,exitedAt:r.checkedOutAt,reasonCode:r.reasonCode,reasonNote:r.reasonNote,operatorName:r.operator.name,returnedAt:r.returnedAt,method:r.checkoutType}));
}
