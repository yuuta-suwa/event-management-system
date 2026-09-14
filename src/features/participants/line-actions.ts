"use server";
import {redirect} from "next/navigation";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
const schema=z.object({participantId:z.string().min(1),lineUserId:z.string().trim().regex(/^U[0-9A-Za-z]{5,64}$/)});
export async function connectParticipantLine(formData:FormData){const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);const parsed=schema.safeParse(Object.fromEntries(formData));if(!parsed.success)throw new Error("INVALID_LINE_USER_ID");if(isLocalDemo())redirect("/participants?notice=demo-line");const {participantId,lineUserId}=parsed.data;const allowed=user.role==="SUPER_ADMIN"||Boolean(await db.eventRegistration.findFirst({where:{participantId,event:{managerId:user.id}}}));if(!allowed)throw new Error("FORBIDDEN");await db.$transaction(async tx=>{await tx.participant.update({where:{id:participantId},data:{lineUserId,lineConnected:true}});await tx.auditLog.create({data:{actorId:user.id,action:"PARTICIPANT_LINE_CONNECTED",entityType:"Participant",entityId:participantId,after:{lineConnected:true}}})});redirect("/participants?notice=line-connected")}
