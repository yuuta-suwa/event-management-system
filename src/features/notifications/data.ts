import type {UserRole} from "@prisma/client";
import {db} from "@/server/db";
import {isLocalDemo} from "@/server/authz";
import {notificationRules,type EventNotificationConfig} from "./schedule";
export async function getEventNotificationSchedule(event:{id:string;eventDate:Date;startTime:Date}&EventNotificationConfig){
  const rules=notificationRules(event,event);
  const now=new Date();
  return Promise.all(rules.map(async rule=>{
    if(!rule.enabled)return {...rule,status:"OFF" as const};
    const jobs=isLocalDemo()?[]:await db.notificationJob.findMany({where:{eventId:event.id,type:rule.type},select:{status:true}});
    const status=jobs.some(j=>j.status==="SENT")?"送信済" as const:jobs.some(j=>j.status==="PENDING"||j.status==="PROCESSING")?"予定" as const:rule.scheduledAt<=now?"スキップ" as const:"予定" as const;
    return {...rule,status};
  }));
}
export async function notificationPageData(user:{id:string;role:UserRole}){if(isLocalDemo())return {counts:{sent:18,pending:4,failed:1,connected:12},logs:[{id:"demo-log",participantName:"山田 太郎",eventName:"秋のビジネス交流会 2026",type:"TICKET",status:"SENT",message:"電子チケットを発行しました。",createdAt:new Date()}]};const scope=user.role==="SUPER_ADMIN"?{}:{event:{managerId:user.id}};const [logs,pending,connected]=await Promise.all([db.notificationLog.findMany({where:scope,include:{participant:true,event:true},orderBy:{createdAt:"desc"},take:100}),db.notificationJob.count({where:{...scope,status:{in:["PENDING","PROCESSING"]}}}),db.participant.count({where:{lineConnected:true,lineUserId:{not:null}}})]);return {counts:{sent:logs.filter(x=>x.status==="SENT").length,pending,failed:logs.filter(x=>x.status==="FAILED").length,connected},logs:logs.map(x=>({id:x.id,participantName:x.participant.name,eventName:x.event.name,type:x.type,status:x.status,message:x.message,createdAt:x.createdAt}))}}
