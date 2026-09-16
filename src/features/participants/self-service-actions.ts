"use server";
import {redirect} from "next/navigation";
import {db} from "@/server/db";
import {verifyRegistrationToken} from "./registration-token";
import {updateMyDetailsSchema} from "./schema";
export type UpdateMyDetailsState={message?:string;errors?:Record<string,string[]>};
export async function updateMyDetails(_:UpdateMyDetailsState,formData:FormData):Promise<UpdateMyDetailsState>{
  const parsed=updateMyDetailsSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return {message:"入力内容を確認してください。",errors:parsed.error.flatten().fieldErrors};
  const secret=process.env.QR_TOKEN_SECRET;
  if(!secret)return {message:"更新できませんでした。時間をおいて再度お試しください。"};
  const registrationId=verifyRegistrationToken(parsed.data.token,secret);
  if(!registrationId)return {message:"リンクが無効です。"};
  const registration=await db.eventRegistration.findUnique({where:{id:registrationId},include:{ticket:{include:{checkin:true}}}});
  if(!registration)return {message:"参加予定が見つかりませんでした。"};
  if(registration.ticket?.checkin)return {message:"受付済みのため、情報は変更できません。"};
  const input=parsed.data;
  const data={name:input.name,nameKana:input.nameKana,phone:input.phone,email:input.email.toLowerCase(),gender:input.gender||null,age:input.age===""||input.age===undefined?null:Number(input.age),occupation:input.occupation||null,referrerName:input.referrerName||null,snsContact:input.snsContact||null,notes:input.notes||null};
  await db.$transaction(async tx=>{
    await tx.participant.update({where:{id:registration.participantId},data});
    await tx.auditLog.create({data:{action:"PARTICIPANT_SELF_UPDATED",entityType:"EventRegistration",entityId:registration.id,after:data}});
  });
  redirect(`/my/${input.token}?notice=updated`);
}
export async function cancelMyRegistration(formData:FormData){
  const token=String(formData.get("token")??"");
  const secret=process.env.QR_TOKEN_SECRET;
  if(!secret)throw new Error("CONFIG_MISSING");
  const registrationId=verifyRegistrationToken(token,secret);
  if(!registrationId)throw new Error("INVALID_TOKEN");
  const registration=await db.eventRegistration.findUnique({where:{id:registrationId},include:{ticket:{include:{checkin:true}}}});
  if(!registration)throw new Error("REGISTRATION_NOT_FOUND");
  if(registration.ticket?.checkin)throw new Error("CHECKED_IN_STATUS_LOCKED");
  if(registration.attendanceStatus!=="CANCELLED"){
    await db.$transaction(async tx=>{
      await tx.eventRegistration.update({where:{id:registration.id},data:{attendanceStatus:"CANCELLED"}});
      if(registration.ticket)await tx.ticket.update({where:{id:registration.ticket.id},data:{status:"CANCELLED",cancelledAt:new Date()}});
      await tx.auditLog.create({data:{action:"PARTICIPANT_SELF_CANCELLED",entityType:"EventRegistration",entityId:registration.id,before:{attendanceStatus:registration.attendanceStatus},after:{attendanceStatus:"CANCELLED"}}});
    });
  }
  redirect(`/my/${token}?notice=cancelled`);
}
