import {db} from "@/server/db";
import {isLocalDemo} from "@/server/authz";
import {demoAllocations} from "@/features/staff/data";
import {getEvent} from "@/features/events/data";
export async function getPublicApplication(eventId:string,ref?:string){if(isLocalDemo()){const event=await getEvent(eventId,{id:"local-demo-super-admin",role:"SUPER_ADMIN"});const allocation=demoAllocations.find(a=>a.referralCode===ref);return event&&event.status==="PUBLISHED"?{event,introducerName:allocation?.staffName??null,referralCode:allocation?.referralCode??null}:null}const event=await db.event.findFirst({where:{id:eventId,status:"PUBLISHED"},include:{category:true}});if(!event)return null;const allocation=ref?await db.ticketAllocation.findFirst({where:{eventId,referralCode:ref},include:{staff:true}}):null;return {event:{...event,categoryName:event.category.name,registrationCount:0,paidCount:0},introducerName:allocation?.staff.displayName??null,referralCode:allocation?.referralCode??null}}
