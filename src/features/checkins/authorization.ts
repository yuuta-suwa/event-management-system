import type {UserRole} from "@prisma/client";
import {db} from "@/server/db";
import {isLocalDemo} from "@/server/authz";
import {verifyTicketToken} from "@/features/tickets/token";
import {canAccessEvent} from "@/server/permissions";
export async function canCheckinToken(user:{id:string;role:UserRole},token:string){if(isLocalDemo())return true;const parsed=verifyTicketToken(token,process.env.QR_TOKEN_SECRET??"");if(!parsed)return false;const ticket=await db.ticket.findUnique({where:{id:parsed.ticketId},select:{event:{select:{managerId:true,staff:{select:{userId:true}}}}}});return Boolean(ticket&&canAccessEvent({role:user.role,userId:user.id,managerId:ticket.event.managerId,assignedUserIds:ticket.event.staff.map(s=>s.userId)}))}
export async function canOperateEvent(user:{id:string;role:UserRole},eventId:string){if(isLocalDemo())return true;const event=await db.event.findUnique({where:{id:eventId},select:{managerId:true,staff:{select:{userId:true}}}});return Boolean(event&&canAccessEvent({role:user.role,userId:user.id,managerId:event.managerId,assignedUserIds:event.staff.map(s=>s.userId)}))}
