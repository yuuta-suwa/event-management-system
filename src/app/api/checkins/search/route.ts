import {NextResponse} from "next/server";
import {z} from "zod";
import {searchCheckinCandidates} from "@/features/checkins/service";
import {isLocalDemo,validatedSessionUser} from "@/server/authz";
import {consumeRateLimit} from "@/server/rate-limit";
const query=z.object({eventId:z.string().min(1),q:z.string().trim().min(1).max(60)});
export async function GET(request:Request){
  const user=await validatedSessionUser();
  if(!user||!(user.role==="SUPER_ADMIN"||user.role==="EVENT_MANAGER"||user.role==="RECEPTION_STAFF"))return NextResponse.json({message:"認証が必要です"},{status:401});
  if(!consumeRateLimit(`checkin-search:${user.id}`,90,60*1000).allowed)return NextResponse.json({message:"検索が多すぎます。しばらく待ってください。"},{status:429});
  const url=new URL(request.url);
  const parsed=query.safeParse({eventId:url.searchParams.get("eventId"),q:url.searchParams.get("q")});
  if(!parsed.success)return NextResponse.json({candidates:[]});
  if(isLocalDemo())return NextResponse.json({candidates:[]});
  const result=await searchCheckinCandidates({...parsed.data,query:parsed.data.q,operator:{id:user.id,name:user.name??"受付スタッフ",role:user.role}});
  if(result==="FORBIDDEN")return NextResponse.json({message:"このイベントを受付する権限がありません"},{status:403});
  return NextResponse.json({candidates:result},{headers:{"Cache-Control":"no-store"}});
}
