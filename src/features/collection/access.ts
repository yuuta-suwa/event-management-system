import {db} from "@/server/db";
import {decideAccess} from "./domain";
export async function loadEventAccess(user:{id:string;role:string},eventId:string){
  const event=await db.event.findUnique({where:{id:eventId},select:{id:true,name:true,price:true,managerId:true,eventDate:true,lineNotifications:true}});
  if(!event)return null;
  const assignments=await db.eventRoleAssignment.findMany({where:{eventId},select:{userId:true,role:true,active:true}});
  return {event,assignments,access:decideAccess({role:user.role,userId:user.id,managerId:event.managerId,assignments})};
}
export async function listAccessibleEvents(user:{id:string;role:string}){
  const where=user.role==="SUPER_ADMIN"?{}:{OR:[...(user.role==="EVENT_MANAGER"?[{managerId:user.id}]:[]),{roleAssignments:{some:{userId:user.id,active:true}}}]};
  return db.event.findMany({where,orderBy:{eventDate:"desc"},select:{id:true,name:true,eventDate:true},take:100});
}
