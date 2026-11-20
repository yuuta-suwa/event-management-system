"use server";
import {redirect} from "next/navigation";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
import {canAccessEvent} from "@/server/permissions";
import {resendTicketEmail,retryFailedEmail} from "./service";
const MANAGERS=["SUPER_ADMIN","EVENT_MANAGER"] as const;
const back=(kind:"notice"|"error",code:string):never=>redirect(`/emails?${kind}=${code}`);
async function authorizedTicket(user:{id:string;role:"SUPER_ADMIN"|"EVENT_MANAGER"|"RECEPTION_STAFF"|"PARTICIPANT"},ticketId:string){
  const ticket=await db.ticket.findUnique({where:{id:ticketId},select:{id:true,event:{select:{managerId:true,staff:{select:{userId:true}}}}}});
  if(!ticket||!canAccessEvent({role:user.role,userId:user.id,managerId:ticket.event.managerId,assignedUserIds:ticket.event.staff.map(s=>s.userId)}))return null;
  return ticket;
}
const resendSchema=z.object({ticketNumber:z.string().trim().min(1).max(60)});
export async function resendEmailByTicketNumber(formData:FormData){
  const user=await requireUser(MANAGERS);
  const parsed=resendSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back("error","invalid");
  if(isLocalDemo())return back("notice","demo");
  const found=await db.ticket.findUnique({where:{ticketNumber:parsed.data.ticketNumber},select:{id:true}});
  if(!found||!await authorizedTicket(user,found.id))return back("error","not_found");
  const r=await resendTicketEmail(found.id,{id:user.id});
  return back(r.ok?"notice":"error",r.ok?`resend_${r.code}`:r.code);
}
const retrySchema=z.object({logId:z.string().min(1)});
export async function retryEmail(formData:FormData){
  const user=await requireUser(MANAGERS);
  const parsed=retrySchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return back("error","invalid");
  if(isLocalDemo())return back("notice","demo");
  const log=await db.emailLog.findUnique({where:{id:parsed.data.logId},select:{ticketId:true}});
  if(!log?.ticketId||!await authorizedTicket(user,log.ticketId))return back("error","not_found");
  const r=await retryFailedEmail(parsed.data.logId,user.id);
  return back(r.ok?"notice":"error",r.ok?`resend_${r.code}`:r.code);
}
