import type {Prisma} from "@prisma/client";
export type LinkResult="LINKED"|"ALREADY_LINKED"|"LINE_USER_LINKED_OTHER"|"PARTICIPANT_LINKED_OTHER";
export type LinkSource="CODE"|"LINE_LOGIN"|"ADMIN";
export function normalizeLinkCode(raw:string){return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g,"")}
export function looksLikeLinkCode(raw:string){const c=normalizeLinkCode(raw);return c.length===8&&raw.trim().length<=16}
export type LineLinkState={linked:boolean;verified:boolean;friend:boolean;notifiable:boolean;blocked:boolean;stage:"NOT_LINKED"|"LINKED_NOT_FRIEND"|"NOTIFIABLE"|"BLOCKED"};
/** 連携状態: 本人認証済み/アカウント紐付け/友だち/通知可能/ブロックを区別する。LINEログイン成功だけでは通知可能にならない。 */
export function lineLinkState(input:{lineUserId:string|null;lineConnected:boolean;lineVerifiedAt:Date|null;friendStatus?:string|null}):LineLinkState{
  const linked=Boolean(input.lineUserId);
  const blocked=linked&&input.friendStatus==="BLOCKED"&&!input.lineConnected;
  const notifiable=linked&&input.lineConnected&&!blocked;
  const friend=notifiable||(linked&&input.friendStatus==="FOLLOWING");
  const stage=!linked?"NOT_LINKED":blocked?"BLOCKED":notifiable?"NOTIFIABLE":"LINKED_NOT_FRIEND";
  return {linked,verified:Boolean(input.lineVerifiedAt),friend,notifiable,blocked,stage};
}
export async function linkParticipantToLineUser(tx:Prisma.TransactionClient,input:{participantId:string;lineUserId:string;displayName?:string|null;source:LinkSource;actorId?:string|null;friendFlag?:boolean|null}):Promise<LinkResult>{
  const owner=await tx.participant.findUnique({where:{lineUserId:input.lineUserId}});
  if(owner&&owner.id!==input.participantId)return "LINE_USER_LINKED_OTHER";
  const participant=await tx.participant.findUniqueOrThrow({where:{id:input.participantId}});
  if(participant.lineConnected&&participant.lineUserId&&participant.lineUserId!==input.lineUserId)return "PARTICIPANT_LINKED_OTHER";
  if(participant.lineUserId&&participant.lineUserId!==input.lineUserId)return "PARTICIPANT_LINKED_OTHER";
  const row=await tx.lineFriend.findUnique({where:{lineUserId:input.lineUserId}});
  const trusted=input.source==="CODE"||input.source==="ADMIN";// 連携コードの送信=友だちである証拠
  const friend=input.friendFlag!=null?input.friendFlag:trusted?true:row?.status==="FOLLOWING";
  const blocked=!friend&&row?.status==="BLOCKED"&&!trusted;
  if(input.source!=="LINE_LOGIN"&&participant.lineUserId===input.lineUserId&&participant.lineConnected)return "ALREADY_LINKED";
  const status=friend?"FOLLOWING":blocked?"BLOCKED":"NOT_FRIEND";
  await tx.participant.update({where:{id:participant.id},data:{lineUserId:input.lineUserId,lineConnected:friend,...(input.friendFlag!=null||trusted?{lineFriendFlag:friend,lineFriendCheckedAt:new Date()}:{}),...(input.source==="LINE_LOGIN"?{lineVerifiedAt:new Date()}:{})}});
  await tx.lineFriend.upsert({where:{lineUserId:input.lineUserId},update:{participantId:participant.id,matchStatus:"MATCHED",matchedAt:new Date(),status,...(friend?{unfollowedAt:null}:{}),...(input.displayName?{displayName:input.displayName}:{})},create:{lineUserId:input.lineUserId,participantId:participant.id,matchStatus:"MATCHED",matchedAt:new Date(),status,displayName:input.displayName??null}});
  await tx.auditLog.create({data:{actorId:input.actorId??null,action:"PARTICIPANT_LINE_LINKED",entityType:"Participant",entityId:participant.id,after:{source:input.source,lineConnected:friend,verified:input.source==="LINE_LOGIN",friend}}});
  return "LINKED";
}
export async function unlinkParticipantLine(tx:Prisma.TransactionClient,input:{participantId:string;actorId?:string|null;reason:string}){
  const participant=await tx.participant.findUnique({where:{id:input.participantId}});
  if(!participant||!participant.lineUserId)return false;
  await tx.participant.update({where:{id:participant.id},data:{lineUserId:null,lineConnected:false}});
  await tx.lineFriend.updateMany({where:{participantId:participant.id},data:{participantId:null,matchStatus:"PENDING",matchedAt:null}});
  await tx.auditLog.create({data:{actorId:input.actorId??null,action:"PARTICIPANT_LINE_UNLINKED",entityType:"Participant",entityId:participant.id,before:{lineConnected:participant.lineConnected},after:{reason:input.reason}}});
  return true;
}
export async function recordFollow(tx:Prisma.TransactionClient,lineUserId:string){
  const friend=await tx.lineFriend.upsert({where:{lineUserId},update:{status:"FOLLOWING",unfollowedAt:null,followedAt:new Date()},create:{lineUserId,status:"FOLLOWING",matchStatus:"PENDING"}});
  if(friend.participantId){
    await tx.participant.updateMany({where:{id:friend.participantId,lineUserId},data:{lineConnected:true,lineFriendFlag:true,lineFriendCheckedAt:new Date()}});
    return {matched:true as const};
  }
  return {matched:false as const};
}
export async function recordUnfollow(tx:Prisma.TransactionClient,lineUserId:string){
  await tx.lineFriend.updateMany({where:{lineUserId},data:{status:"BLOCKED",unfollowedAt:new Date()}});
  await tx.participant.updateMany({where:{lineUserId},data:{lineConnected:false,lineFriendFlag:false,lineFriendCheckedAt:new Date()}});
}
