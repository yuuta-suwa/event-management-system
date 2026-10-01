"use server";
import {redirect} from "next/navigation";
import {z} from "zod";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
const addSchema=z.object({label:z.string().trim().min(1,"項目名を入力してください").max(60),amount:z.coerce.number().int().min(0,"金額は0以上にしてください").max(100000000),note:z.string().trim().max(300).optional()});
export async function addExpense(eventId:string,formData:FormData){
  const actor=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const parsed=addSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)throw new Error("INVALID_INPUT");
  if(isLocalDemo())redirect(`/events/${eventId}/expenses?notice=demo`);
  await db.$transaction(async tx=>{
    const expense=await tx.eventExpense.create({data:{eventId,label:parsed.data.label,amount:parsed.data.amount,note:parsed.data.note||null}});
    await tx.auditLog.create({data:{actorId:actor.id,action:"EVENT_EXPENSE_ADDED",entityType:"EventExpense",entityId:expense.id,after:expense}});
  });
  redirect(`/events/${eventId}/expenses?notice=added`);
}
const deleteSchema=z.object({expenseId:z.string().min(1)});
export async function deleteExpense(eventId:string,formData:FormData){
  const actor=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const parsed=deleteSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)throw new Error("INVALID_INPUT");
  if(isLocalDemo())redirect(`/events/${eventId}/expenses?notice=demo`);
  const existing=await db.eventExpense.findUnique({where:{id:parsed.data.expenseId}});
  if(!existing||existing.eventId!==eventId)throw new Error("NOT_FOUND");
  await db.$transaction(async tx=>{
    await tx.eventExpense.delete({where:{id:parsed.data.expenseId}});
    await tx.auditLog.create({data:{actorId:actor.id,action:"EVENT_EXPENSE_DELETED",entityType:"EventExpense",entityId:existing.id,before:existing}});
  });
  redirect(`/events/${eventId}/expenses?notice=deleted`);
}
