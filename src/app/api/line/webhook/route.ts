import {NextResponse} from "next/server";
import {verifyLineSignature} from "@/features/notifications/domain";
import {replyLineMessage} from "@/features/notifications/line";
import {db} from "@/server/db";
type LineWebhookEvent={type?:string;replyToken?:string;source?:{type?:string;groupId?:string;userId?:string};message?:{type?:string;text?:string}};
async function linkParticipantByCode(userId:string,rawText:string,replyToken?:string){
  const code=rawText.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(code.length<6||code.length>8)return;
  const participant=await db.participant.findFirst({where:{lineLinkCode:code}});
  if(!participant)return;
  try{
    await db.participant.update({where:{id:participant.id},data:{lineUserId:userId,lineConnected:true}});
    if(replyToken)await replyLineMessage(replyToken,"LINE連携が完了しました。今後、入金確認や当日のご案内をこちらにお送りします。").catch(()=>{});
  }catch{
    if(replyToken)await replyLineMessage(replyToken,"連携に失敗しました。時間をおいて再度お試しください。").catch(()=>{});
  }
}
export async function POST(request:Request){const length=Number(request.headers.get("content-length")??0);if(length>1024*1024)return NextResponse.json({error:"PAYLOAD_TOO_LARGE"},{status:413});const body=await request.text();if(body.length>1024*1024)return NextResponse.json({error:"PAYLOAD_TOO_LARGE"},{status:413});if(!verifyLineSignature(body,request.headers.get("x-line-signature"),process.env.LINE_CHANNEL_SECRET??""))return NextResponse.json({error:"INVALID_SIGNATURE"},{status:401});let events:LineWebhookEvent[]=[];try{const parsed=JSON.parse(body);events=Array.isArray(parsed.events)?parsed.events:[]}catch{events=[]}for(const event of events){const groupId=event.source?.type==="group"?event.source.groupId:undefined;if(groupId){if(event.type==="join")await db.lineGroup.upsert({where:{groupId},update:{active:true,leftAt:null},create:{groupId}});else if(event.type==="leave")await db.lineGroup.updateMany({where:{groupId},data:{active:false,leftAt:new Date()}});continue}if(event.type==="message"&&event.message?.type==="text"&&event.source?.type==="user"&&event.source.userId&&event.message.text){await linkParticipantByCode(event.source.userId,event.message.text,event.replyToken)}}return NextResponse.json({ok:true})}
