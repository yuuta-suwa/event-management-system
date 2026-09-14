import {NextResponse} from "next/server";
import {createReminderJobs,processDueNotificationJobs} from "@/features/notifications/service";
import {isLocalDemo} from "@/server/authz";
export async function POST(request:Request){const secret=process.env.NOTIFICATION_JOB_SECRET;if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});if(isLocalDemo())return NextResponse.json({scheduled:0,processed:0,sent:0,failed:0,demo:true});const scheduled=await createReminderJobs();const result=await processDueNotificationJobs();return NextResponse.json({scheduled,...result})}
