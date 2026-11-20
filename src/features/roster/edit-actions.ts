"use server";
import {redirect} from "next/navigation";
import {requireUser} from "@/server/authz";
import {applyRosterEdit} from "./edit-service";

export async function editRosterEntry(formData:FormData){
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const raw=Object.fromEntries(formData) as Record<string,unknown>;
  const registrationId=String(raw.registrationId??"");
  const res=await applyRosterEdit(user,{registrationId,reason:raw.reason,fields:raw,snapshot:typeof raw.snapshot==="string"?raw.snapshot:undefined});
  if(res.ok)redirect(`/participants?event=${encodeURIComponent(res.eventId)}&notice=roster_edited`);
  redirect(`/participants/edit?registration=${encodeURIComponent(registrationId)}&error=${res.error}`);
}
