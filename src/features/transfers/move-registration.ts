import type {Prisma} from "@prisma/client";
export async function moveRegistration(tx:Prisma.TransactionClient,input:{ticketId:string;eventId:string;toParticipantId:string;orderClaim?:boolean}){
  const previous=await tx.eventRegistration.findUnique({where:{ticketId:input.ticketId}});
  if(previous)await tx.eventRegistration.update({where:{id:previous.id},data:{ticketId:null,attendanceStatus:"CANCELLED"}});
  const status=previous&&previous.attendanceStatus!=="CANCELLED"?previous.attendanceStatus:"APPLIED";
  const existing=await tx.eventRegistration.findUnique({where:{eventId_participantId:{eventId:input.eventId,participantId:input.toParticipantId}}});
  if(existing){
    if(existing.ticketId)throw new Error("ALREADY_REGISTERED");
    return tx.eventRegistration.update({where:{id:existing.id},data:{ticketId:input.ticketId,attendanceStatus:status}});
  }
  return tx.eventRegistration.create({data:{eventId:input.eventId,participantId:input.toParticipantId,ticketId:input.ticketId,attendanceStatus:status,applicationSource:input.orderClaim?"ORDER_CLAIM":"TRANSFER"}});
}
