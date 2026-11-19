import {NextResponse} from "next/server";
import {z} from "zod";
import {processCheckoutByCode,processCheckoutByQr,processCheckoutBySearch,recordReentry,updateCheckoutReason} from "@/features/checkins/exit-service";
import {EXIT_NOTE_MAX,EXIT_REASON_CODES} from "@/features/checkins/exit-domain";
import type {CheckinResult} from "@/features/checkins/service";
import {clientAddress,consumeRateLimit} from "@/server/rate-limit";
import {isLocalDemo,validatedSessionUser} from "@/server/authz";
const reason=z.enum(EXIT_REASON_CODES);
const note=z.string().max(EXIT_NOTE_MAX*2).optional();
// op と method の組み合わせで判別する(同じ op が複数あるので discriminatedUnion は使えない)
const schema=z.union([
  z.object({op:z.literal("EXIT"),method:z.literal("QR"),token:z.string().min(20).max(1000),eventId:z.string().optional(),reason,note}),
  z.object({op:z.literal("EXIT"),method:z.literal("RECEPTION_CODE"),eventId:z.string().min(1),code:z.string().min(1).max(20),reason,note}),
  z.object({op:z.literal("EXIT"),method:z.literal("NAME_SEARCH"),eventId:z.string().min(1),ticketId:z.string().min(1),reason,note}),
  z.object({op:z.literal("REENTER"),ticketId:z.string().min(1),eventId:z.string().optional()}),
  z.object({op:z.literal("REASON"),checkoutId:z.string().min(1),reason,note}),
]);
const STATUS:Partial<Record<CheckinResult["kind"],number>>={INVALID:404,FORBIDDEN:403,LOCKED:429};
const noStore={"Cache-Control":"no-store"};
export async function POST(request:Request){
  const [user,body]=await Promise.all([validatedSessionUser(),request.json().catch(()=>null)]);
  if(!user||!(user.role==="SUPER_ADMIN"||user.role==="EVENT_MANAGER"||user.role==="RECEPTION_STAFF"))return NextResponse.json({message:"認証が必要です"},{status:401});
  const rate=consumeRateLimit(`checkout:${user.id}:${clientAddress(request.headers)}`,120,60*1000);
  if(!rate.allowed)return NextResponse.json({message:"操作が多すぎます。しばらく待って再試行してください。"},{status:429,headers:{"Retry-After":String(rate.retryAfterSeconds),...noStore}});
  const parsed=schema.safeParse(body);
  if(!parsed.success)return NextResponse.json({message:"入力が不正です（退出の理由を選んでください）"},{status:400});
  if(isLocalDemo())return NextResponse.json({kind:"INVALID",message:"デモモードでは退出の記録は利用できません"},{status:400});
  const operator={id:user.id,name:user.name??"受付スタッフ",role:user.role};
  const i=parsed.data;
  const result=i.op==="REENTER"?await recordReentry({ticketId:i.ticketId,eventId:i.eventId,operator})
    :i.op==="REASON"?await updateCheckoutReason({checkoutId:i.checkoutId,operator,reason:{code:i.reason,note:i.note}})
    :i.method==="QR"?await processCheckoutByQr({token:i.token,eventId:i.eventId,operator,reason:{code:i.reason,note:i.note}})
    :i.method==="RECEPTION_CODE"?await processCheckoutByCode({eventId:i.eventId,code:i.code,operator,reason:{code:i.reason,note:i.note}})
    :await processCheckoutBySearch({eventId:i.eventId,ticketId:i.ticketId,operator,reason:{code:i.reason,note:i.note}});
  return NextResponse.json(result,{status:STATUS[result.kind]??200,headers:noStore});
}
