"use server";
import {redirect} from "next/navigation";
import {requireUser} from "@/server/authz";
import {applyLedgerEdit} from "./edit-service";
const STAFF=["SUPER_ADMIN","EVENT_MANAGER","RECEPTION_STAFF"] as const;

export async function editLedgerEntry(formData:FormData){
  const user=await requireUser(STAFF);
  const raw=Object.fromEntries(formData) as Record<string,unknown>;
  const type=String(raw.type??""),id=String(raw.id??"");
  const res=await applyLedgerEdit(user,{type,id,reason:raw.reason,fields:raw,snapshot:typeof raw.snapshot==="string"?raw.snapshot:undefined});
  if(res.ok)redirect(`/ledger?event=${encodeURIComponent(res.eventId)}&notice=edited`);
  redirect(`/ledger/edit?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&error=${res.error}`);
}
