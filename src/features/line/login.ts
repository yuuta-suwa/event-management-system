import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";
const prefix="lls1";
export const loginCookieName="line_login_nonce";
export type LoginConfig={channelId:string;channelSecret:string;redirectUri:string};
export function lineLoginConfig(env:NodeJS.ProcessEnv=process.env):LoginConfig|null{
  const channelId=env.LINE_LOGIN_CHANNEL_ID,channelSecret=env.LINE_LOGIN_CHANNEL_SECRET;
  if(!channelId||!channelSecret)return null;
  return {channelId,channelSecret,redirectUri:`${env.NEXT_PUBLIC_APP_URL??"http://127.0.0.1:3000"}/api/line/login/callback`};
}
export function newNonce(){return randomBytes(16).toString("base64url")}
export type LoginState={registrationId:string;nonce:string;expiresAt:number};
export function issueLoginState(input:LoginState,secret:string){if(secret.length<32)throw new Error("QR_TOKEN_SECRET_TOO_SHORT");const payload=Buffer.from(JSON.stringify({r:input.registrationId,n:input.nonce,e:input.expiresAt}),"utf8").toString("base64url");const sig=createHmac("sha256",secret).update(`${prefix}.${payload}`).digest("base64url");return `${prefix}.${payload}.${sig}`}
export function verifyLoginState(state:string,secret:string,nowSec=Math.floor(Date.now()/1000)):LoginState|null{
  if(secret.length<32)return null;const parts=state.split(".");if(parts.length!==3||parts[0]!==prefix)return null;
  const expected=createHmac("sha256",secret).update(`${prefix}.${parts[1]}`).digest();let supplied:Buffer;try{supplied=Buffer.from(parts[2],"base64url")}catch{return null}
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return null;
  try{const b=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8")) as {r?:unknown;n?:unknown;e?:unknown};if(typeof b.r!=="string"||typeof b.n!=="string"||!Number.isInteger(b.e)||(b.e as number)<=nowSec)return null;return {registrationId:b.r,nonce:b.n,expiresAt:b.e as number}}catch{return null}
}
export function sameNonce(a:string|undefined|null,b:string){if(!a)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
export function buildAuthorizeUrl(cfg:LoginConfig,state:string,nonce:string){
  const q=new URLSearchParams({response_type:"code",client_id:cfg.channelId,redirect_uri:cfg.redirectUri,state,scope:"profile openid",nonce,bot_prompt:"normal"});
  return `https://access.line.me/oauth2/v2.1/authorize?${q.toString()}`;
}
export async function fetchFriendFlag(accessToken:string,fetchFn:typeof fetch=fetch):Promise<boolean|null>{
  // LINEログインとMessaging APIチャネルを連携済みの公式アカウントに対する友だち状態(ログイン直後のみ取得できる)
  try{
    const response=await fetchFn("https://api.line.me/friendship/v1/status",{headers:{Authorization:`Bearer ${accessToken}`}});
    if(!response?.ok)return null;
    const body=await response.json() as {friendFlag?:unknown};
    return typeof body.friendFlag==="boolean"?body.friendFlag:null;
  }catch{return null}
}
export async function fetchLineIdentity(cfg:LoginConfig,code:string,nonce:string,fetchFn:typeof fetch=fetch):Promise<{userId:string;name:string|null;friendFlag:boolean|null}>{
  const token=await fetchFn("https://api.line.me/oauth2/v2.1/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:cfg.redirectUri,client_id:cfg.channelId,client_secret:cfg.channelSecret})});
  if(!token.ok)throw new Error(`LINE_LOGIN_TOKEN_${token.status}`);
  const {id_token,access_token}=await token.json() as {id_token?:string;access_token?:string};
  if(!id_token)throw new Error("LINE_LOGIN_NO_ID_TOKEN");
  const verify=await fetchFn("https://api.line.me/oauth2/v2.1/verify",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({id_token,client_id:cfg.channelId,nonce})});
  if(!verify.ok)throw new Error(`LINE_LOGIN_VERIFY_${verify.status}`);
  const profile=await verify.json() as {sub?:string;name?:string;nonce?:string};
  if(!profile.sub||profile.nonce!==nonce)throw new Error("LINE_LOGIN_INVALID_ID_TOKEN");
  const friendFlag=access_token?await fetchFriendFlag(access_token,fetchFn):null;
  return {userId:profile.sub,name:profile.name??null,friendFlag};
}
