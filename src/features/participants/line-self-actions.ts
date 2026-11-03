"use server";
import {redirect} from "next/navigation";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo} from "@/server/authz";
import {unlinkParticipantLine} from "@/features/line/link";
import {qrTokenSecret} from "@/features/tickets/token";
import {verifyRegistrationToken} from "./registration-token";
const schema=z.object({token:z.string().min(1)});
export async function unlinkMyLine(formData:FormData){
  const parsed=schema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)throw new Error("INVALID_INPUT");
  if(isLocalDemo())redirect(`/my/${parsed.data.token}`);
  const registrationId=verifyRegistrationToken(parsed.data.token,qrTokenSecret());
  if(!registrationId)throw new Error("INVALID_TOKEN");
  const registration=await db.eventRegistration.findUnique({where:{id:registrationId}});
  if(!registration)throw new Error("NOT_FOUND");
  await db.$transaction(tx=>unlinkParticipantLine(tx,{participantId:registration.participantId,reason:"SELF_UNLINK"}));
  redirect(`/my/${parsed.data.token}?notice=line-unlinked`);
}
