import {NextResponse} from "next/server";
import {db} from "@/server/db";
import {issueRegistrationToken} from "@/features/participants/registration-token";
import {qrTokenSecret} from "@/features/tickets/token";
import {fetchLineIdentity,lineLoginConfig,loginCookieName,sameNonce,verifyLoginState} from "@/features/line/login";
import {linkParticipantToLineUser} from "@/features/line/link";
function cookieValue(header:string|null,name:string){return header?.split(";").map(p=>p.trim()).find(p=>p.startsWith(`${name}=`))?.slice(name.length+1)}
export async function GET(request:Request){
  const url=new URL(request.url);const origin=process.env.NEXT_PUBLIC_APP_URL??url.origin;
  const secret=qrTokenSecret();const cfg=lineLoginConfig();
  const state=verifyLoginState(url.searchParams.get("state")??"",secret);
  const code=url.searchParams.get("code");
  if(!cfg||!state||!code||!sameNonce(cookieValue(request.headers.get("cookie"),loginCookieName),state.nonce))return NextResponse.json({error:"INVALID_LOGIN_STATE"},{status:400});
  const registration=await db.eventRegistration.findUnique({where:{id:state.registrationId}});
  if(!registration)return NextResponse.json({error:"INVALID_LOGIN_STATE"},{status:400});
  const myPage=`${origin}/my/${issueRegistrationToken(registration.id,secret)}`;
  let notice="line-linked";
  try{
    const identity=await fetchLineIdentity(cfg,code,state.nonce);
    const result=await db.$transaction(tx=>linkParticipantToLineUser(tx,{participantId:registration.participantId,lineUserId:identity.userId,displayName:identity.name,source:"LINE_LOGIN"}));
    if(result==="LINE_USER_LINKED_OTHER"||result==="PARTICIPANT_LINKED_OTHER")notice="line-conflict";
  }catch{notice="line-login-failed"}
  const response=NextResponse.redirect(`${myPage}?notice=${notice}`);
  response.cookies.set(loginCookieName,"",{maxAge:0,path:"/api/line/login"});
  return response;
}
