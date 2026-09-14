import {NextResponse} from "next/server";
import {z} from "zod";
import {processCheckin} from "@/features/checkins/service";
import {clientAddress,consumeRateLimit} from "@/server/rate-limit";
import {validatedSessionUser} from "@/server/authz";
import {canCheckinToken} from "@/features/checkins/authorization";
const schema=z.object({token:z.string().min(20).max(1000),eventId:z.string().optional(),resolution:z.enum(["ONSITE_PAYMENT","REJECT","ADMIN_CONFIRMATION"]).optional()});
export async function POST(request:Request){const user=await validatedSessionUser();if(!user||!(user.role==="SUPER_ADMIN"||user.role==="EVENT_MANAGER"||user.role==="RECEPTION_STAFF"))return NextResponse.json({message:"認証が必要です"},{status:401});const rate=consumeRateLimit(`checkin:${user.id}:${clientAddress(request.headers)}`,120,60*1000);if(!rate.allowed)return NextResponse.json({message:"受付操作が多すぎます。しばらく待って再試行してください。"},{status:429,headers:{"Retry-After":String(rate.retryAfterSeconds)}});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({message:"入力が不正です"},{status:400});if(!await canCheckinToken(user,parsed.data.token))return NextResponse.json({message:"このイベントを受付する権限がありません"},{status:403});const result=await processCheckin({...parsed.data,operatorId:user.id,operatorName:user.name??"受付スタッフ"});return NextResponse.json(result,{status:result.kind==="INVALID"?404:200,headers:{"Cache-Control":"no-store"}})}
