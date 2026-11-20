import {NextResponse} from "next/server";
import {z} from "zod";
import {processCheckin,processCheckinByCode,processCheckinBySearch} from "@/features/checkins/service";
import type {CheckinResult} from "@/features/checkins/service";
import {clientAddress,consumeRateLimit} from "@/server/rate-limit";
import {isLocalDemo,validatedSessionUser} from "@/server/authz";
const resolution=z.enum(["ONSITE_PAYMENT","REJECT","ADMIN_CONFIRMATION"]).optional();
const schema=z.discriminatedUnion("method",[
  z.object({method:z.literal("QR"),token:z.string().min(20).max(1000),eventId:z.string().optional(),resolution}),
  z.object({method:z.literal("RECEPTION_CODE"),eventId:z.string().min(1),code:z.string().min(1).max(20),resolution}),
  z.object({method:z.literal("NAME_SEARCH"),eventId:z.string().min(1),ticketId:z.string().min(1),verification:z.enum(["SELF_DECLARED","ID_DOCUMENT","PHONE_LAST4"]),phoneLast4:z.string().max(8).optional(),resolution}),
]);
const STATUS:Partial<Record<CheckinResult["kind"],number>>={INVALID:404,FORBIDDEN:403,LOCKED:429};
const noStore={"Cache-Control":"no-store"};
export async function POST(request:Request){
  const started=performance.now();
  const [user,body]=await Promise.all([validatedSessionUser(),request.json().catch(()=>null)]);
  if(!user||!(user.role==="SUPER_ADMIN"||user.role==="EVENT_MANAGER"||user.role==="RECEPTION_STAFF"))return NextResponse.json({message:"認証が必要です"},{status:401});
  const rate=consumeRateLimit(`checkin:${user.id}:${clientAddress(request.headers)}`,120,60*1000);
  if(!rate.allowed)return NextResponse.json({message:"受付操作が多すぎます。しばらく待って再試行してください。"},{status:429,headers:{"Retry-After":String(rate.retryAfterSeconds),...noStore}});
  // 従来のクライアント(method省略)はQR受付として扱う
  const parsed=schema.safeParse(body&&typeof body==="object"&&!("method" in body)?{...body,method:"QR"}:body);
  if(!parsed.success)return NextResponse.json({message:"入力が不正です"},{status:400});
  const operator={id:user.id,name:user.name??"受付スタッフ",role:user.role};
  const input=parsed.data;
  if(isLocalDemo()&&input.method!=="QR")return NextResponse.json({kind:"INVALID",message:"デモモードではQR受付のみ利用できます"},{status:400});
  const result=input.method==="QR"
    ?await processCheckin({token:input.token,eventId:input.eventId,operatorId:operator.id,operatorName:operator.name,operatorRole:operator.role,resolution:input.resolution})
    :input.method==="RECEPTION_CODE"
      ?await processCheckinByCode({eventId:input.eventId,code:input.code,operator,resolution:input.resolution})
      :await processCheckinBySearch({eventId:input.eventId,ticketId:input.ticketId,verification:input.verification,phoneLast4:input.phoneLast4,operator,resolution:input.resolution});
  const elapsed=performance.now()-started;
  return NextResponse.json(result,{status:STATUS[result.kind]??200,headers:{...noStore,"Server-Timing":`checkin;dur=${elapsed.toFixed(1)}`}});
}
