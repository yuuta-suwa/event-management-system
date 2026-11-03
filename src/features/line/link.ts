import type {Prisma} from "@prisma/client";
export type LinkResult="LINKED"|"ALREADY_LINKED"|"LINE_USER_LINKED_OTHER"|"PARTICIPANT_LINKED_OTHER";
export type LinkSource="CODE"|"LINE_LOGIN"|"ADMIN";
export function normalizeLinkCode(raw:string){return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g,"")}
export function looksLikeLinkCode(raw:string){const c=normalizeLinkCode(raw);return c.length===8&&raw.trim().length<=16}
export async function linkParticipantToLineUser(tx:Prisma.TransactionClient,input:{participantId:string;lineUserId:string;displayName?:string|null;source:LinkSource;actorId?:string|null}):Promise<LinkResult>{
  const owner=await tx.participant.findUnique({where:{lineUserId:input.lineUserId}});
  if(owner&&owner.id!==input.participantId)return "LINE_USER_LINKED_OTHER";
  const participant=await tx.participant.findUniqueOrThrow({where:{id:input.participantId}});
  if(participant.lineUserId===input.lineUserId&&participant.lineConnected)return "ALREADY_LINKED";
  
  if(participant.lineConnected&&participant.lineUserId&&participant.lineUserId!==input.lineUserId)return "PARTICIPANT_LINKED_OTHER";
  await tx.participant.update({where:{id:participant.id},data:{lineUserId:input.lineUserId,lineConnected:true}});
  await tx.lineFriend.upsert({where:{lineUserId:input.lineUserId},update:{participantId:participant.id,matchStatus:"MATCHED",matchedAt:new Date(),...(input.displayName?{displayName:input.displayName}:{})},create:{lineUserId:input.lineUserId,participantId:participant.id,matchStatus:"MATCHED",matchedAt:new Date(),displayName:input.displayName??null}});
  await tx.auditLog.create({data:{actorId:input.actorId??null,action:"PARTICIPANT_LINE_LINKED",entityType:"Participant",entityId:participant.id,after:{source:input.source,lineConnected:true}}});
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
    await tx.participant.updateMany({where:{id:friend.participantId,lineUserId},data:{lineConnected:true}});
    return {matched:true as const};
  }
  return {matched:false as const};
}
export async function recordUnfollow(tx:Prisma.TransactionClient,lineUserId:string){
  await tx.lineFriend.updateMany({where:{lineUserId},data:{status:"BLOCKED",unfollowedAt:new Date()}});
  await tx.participant.updateMany({where:{lineUserId},data:{lineConnected:false}});
}
