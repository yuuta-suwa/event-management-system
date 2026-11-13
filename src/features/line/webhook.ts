import {db} from "@/server/db";
import {replyLineMessage} from "@/features/notifications/line";
import {linkParticipantToLineUser,looksLikeLinkCode,normalizeLinkCode,recordFollow,recordUnfollow} from "./link";
export type LineWebhookEvent={type?:string;webhookEventId?:string;replyToken?:string;source?:{type?:string;groupId?:string;userId?:string};message?:{type?:string;text?:string}};
const FOLLOW_GUIDE="友だち追加ありがとうございます。\nイベントのチケットを購入・受取済みの方は、マイチケット画面から「LINEで登録・連携する」を押してLINE連携を行ってください。";
const MESSAGES={
  linked:"LINE連携が完了しました。今後、入金確認や当日のご案内をこちらにお送りします。",
  already:"すでにLINE連携済みです。",
  notFound:"連携コードが見つかりませんでした。マイページに表示されているコード（8文字）をご確認ください。",
  lineUserTaken:"このLINEアカウントはすでに別のお申し込みに連携されています。変更が必要な場合は、先に連携済みのマイページから連携を解除してください。",
  participantTaken:"このお申し込みはすでに別のLINEアカウントと連携されています。変更する場合は、マイページから連携を解除してから再度お試しください。",
  welcomeBack:"おかえりなさい。LINE連携を再開しました。",
  failed:"連携に失敗しました。時間をおいて再度お試しください。",
} as const;
async function claimEvent(event:LineWebhookEvent){
  if(!event.webhookEventId)return true;
  const created=await db.lineWebhookEvent.createMany({data:[{id:event.webhookEventId}],skipDuplicates:true});
  return created.count===1;
}
async function handleCodeMessage(userId:string,text:string):Promise<string|null>{
  if(!looksLikeLinkCode(text))return null;
  const code=normalizeLinkCode(text);
  const participant=await db.participant.findFirst({where:{lineLinkCode:code}});
  if(!participant)return MESSAGES.notFound;
  const result=await db.$transaction(tx=>linkParticipantToLineUser(tx,{participantId:participant.id,lineUserId:userId,source:"CODE"}));
  return result==="LINKED"?MESSAGES.linked:result==="ALREADY_LINKED"?MESSAGES.already:result==="LINE_USER_LINKED_OTHER"?MESSAGES.lineUserTaken:MESSAGES.participantTaken;
}
export async function processLineEvents(events:LineWebhookEvent[]){
  if(events.length)await db.lineWebhookEvent.deleteMany({where:{receivedAt:{lt:new Date(Date.now()-14*86400000)}}}).catch(()=>{});
  for(const event of events){
    const groupId=event.source?.type==="group"?event.source.groupId:undefined;
    if(groupId){
      if(event.type==="join")await db.lineGroup.upsert({where:{groupId},update:{active:true,leftAt:null},create:{groupId}});
      else if(event.type==="leave")await db.lineGroup.updateMany({where:{groupId},data:{active:false,leftAt:new Date()}});
      continue;
    }
    const userId=event.source?.type==="user"?event.source.userId:undefined;
    if(!userId)continue;
    if(!await claimEvent(event))continue;
    let reply:string|null=null;
    try{
      if(event.type==="follow"){const r=await db.$transaction(tx=>recordFollow(tx,userId));reply=r.matched?MESSAGES.welcomeBack:FOLLOW_GUIDE}
      else if(event.type==="unfollow"){await db.$transaction(tx=>recordUnfollow(tx,userId))}
      else if(event.type==="message"&&event.message?.type==="text"&&event.message.text)reply=await handleCodeMessage(userId,event.message.text);
    }catch{reply=MESSAGES.failed}
    if(reply&&event.replyToken)await replyLineMessage(event.replyToken,reply).catch(()=>{});
  }
}
