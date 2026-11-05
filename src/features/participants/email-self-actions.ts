"use server";
import {redirect} from "next/navigation";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo} from "@/server/authz";
import {qrTokenSecret} from "@/features/tickets/token";
import {resendTicketEmail} from "@/features/email/service";
import {verifyRegistrationToken} from "./registration-token";
const schema=z.object({token:z.string().min(1)});
/** 現在の保有者本人が、自分のチケットを登録メールアドレスへ再送する(24時間に3回まで)。 */
export async function resendMyTicketEmail(formData:FormData){
  const parsed=schema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)throw new Error("INVALID_INPUT");
  const token=parsed.data.token;
  if(isLocalDemo())redirect(`/my/${token}?notice=email-demo`);
  const registrationId=verifyRegistrationToken(token,qrTokenSecret());
  if(!registrationId)throw new Error("INVALID_TOKEN");
  const reg=await db.eventRegistration.findUnique({where:{id:registrationId},include:{ticket:{select:{id:true,participantId:true,claimed:true}}}});
  // 他人へ譲渡済みのチケットは再送できない(現在の保有者本人のみ)
  if(!reg?.ticket||reg.ticket.participantId!==reg.participantId||!reg.ticket.claimed)redirect(`/my/${token}?notice=email-unavailable`);
  const r=await resendTicketEmail(reg.ticket.id,{id:null});
  redirect(`/my/${token}?notice=${r.ok?(r.code==="sent"?"email-sent":"email-queued"):r.code==="rate_limited"?"email-limit":"email-unavailable"}`);
}
