import {NextResponse} from "next/server";
import {db} from "@/server/db";
import {verifyRegistrationToken} from "@/features/participants/registration-token";
import {qrTokenSecret} from "@/features/tickets/token";
import {buildAuthorizeUrl,issueLoginState,lineLoginConfig,loginCookieName,newNonce} from "@/features/line/login";
export async function GET(request:Request){
  const url=new URL(request.url);const token=url.searchParams.get("token")??"";
  const origin=process.env.NEXT_PUBLIC_APP_URL??url.origin;
  const registrationId=verifyRegistrationToken(token,qrTokenSecret());
  if(!registrationId||!await db.eventRegistration.findUnique({where:{id:registrationId},select:{id:true}}))return NextResponse.json({error:"INVALID_TOKEN"},{status:400});
  const cfg=lineLoginConfig();
  if(!cfg)return NextResponse.redirect(`${origin}/my/${token}?notice=line-login-unavailable`);
  const nonce=newNonce();
  const state=issueLoginState({registrationId,nonce,expiresAt:Math.floor(Date.now()/1000)+600},qrTokenSecret());
  const response=NextResponse.redirect(buildAuthorizeUrl(cfg,state,nonce));
  response.cookies.set(loginCookieName,nonce,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:600,path:"/api/line/login"});
  return response;
}
