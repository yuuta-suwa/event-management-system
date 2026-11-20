"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {db} from "@/server/db";
import {requireUser,isLocalDemo} from "@/server/authz";
import {pushLineMessage} from "./line";
export async function listLineGroups(){
  if(isLocalDemo())return [{id:"demo-group",groupId:"Cdemo0000000000000000000000000",name:"デモグループ",active:true}];
  return db.lineGroup.findMany({where:{active:true},orderBy:{joinedAt:"desc"},select:{id:true,groupId:true,name:true,active:true}});
}
const renameSchema=z.object({groupId:z.string().min(1),name:z.string().trim().max(60)});
export async function renameLineGroup(formData:FormData){
  await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const parsed=renameSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)throw new Error("INVALID_INPUT");
  if(isLocalDemo()){revalidatePath("/notifications");return}
  await db.lineGroup.update({where:{groupId:parsed.data.groupId},data:{name:parsed.data.name||null}});
  revalidatePath("/notifications");
}
const broadcastSchema=z.object({groupId:z.string().min(1),message:z.string().trim().min(1).max(1000)});
export async function sendGroupBroadcast(_:{message?:string},formData:FormData):Promise<{message?:string}>{
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const parsed=broadcastSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return {message:"送信内容を確認してください。"};
  if(isLocalDemo())return {message:"ローカルデモでは送信しません。"};
  try{
    await pushLineMessage(parsed.data.groupId,parsed.data.message);
    await db.auditLog.create({data:{actorId:user.id,action:"LINE_GROUP_BROADCAST",entityType:"LineGroup",entityId:parsed.data.groupId,after:{message:parsed.data.message}}});
    revalidatePath("/notifications");
    return {message:"送信しました。"};
  }catch(error){
    return {message:`送信に失敗しました：${error instanceof Error?error.message:"UNKNOWN_ERROR"}`};
  }
}
