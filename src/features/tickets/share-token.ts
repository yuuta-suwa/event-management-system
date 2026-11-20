import {createHmac,timingSafeEqual} from "node:crypto";
const prefix="shr1";
export type ShareTokenPayload={ticketId:string;shareVersion:number;expiresAt:number};
export function issueShareToken(input:ShareTokenPayload,secret:string){if(secret.length<32)throw new Error("QR_TOKEN_SECRET_TOO_SHORT");const payload=Buffer.from(JSON.stringify({t:input.ticketId,v:input.shareVersion,e:input.expiresAt}),"utf8").toString("base64url");const signature=createHmac("sha256",secret).update(`${prefix}.${payload}`).digest("base64url");return `${prefix}.${payload}.${signature}`}
export function verifyShareToken(token:string,secret:string,nowSec=Math.floor(Date.now()/1000)):ShareTokenPayload|null{if(secret.length<32)return null;const parts=token.split(".");if(parts.length!==3||parts[0]!==prefix)return null;const expected=createHmac("sha256",secret).update(`${prefix}.${parts[1]}`).digest();let supplied:Buffer;try{supplied=Buffer.from(parts[2],"base64url")}catch{return null}if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return null;try{const body=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8")) as {t?:unknown;v?:unknown;e?:unknown};if(typeof body.t!=="string"||!Number.isInteger(body.v)||!Number.isInteger(body.e))return null;if((body.e as number)<=nowSec)return null;return {ticketId:body.t,shareVersion:body.v as number,expiresAt:body.e as number}}catch{return null}}
export function shareExpiry(days=7,nowMs=Date.now()){return (Math.floor(nowMs/86400000)+days+1)*86400}
import {verifyClaimToken} from "./claim-token";
export type LinkResolution={ok:true;ticketId:string;shareVersion:number;legacy:boolean}|{ok:false;reason:"invalid"|"expired"};
export function resolveLinkToken(token:string,secret:string,nowSec=Math.floor(Date.now()/1000)):LinkResolution{
  if(token.startsWith(`${prefix}.`)){
    const live=verifyShareToken(token,secret,nowSec);
    if(live)return {ok:true,ticketId:live.ticketId,shareVersion:live.shareVersion,legacy:false};
    return verifyShareToken(token,secret,0)?{ok:false,reason:"expired"}:{ok:false,reason:"invalid"};
  }
  const ticketId=verifyClaimToken(token,secret);
  return ticketId?{ok:true,ticketId,shareVersion:0,legacy:true}:{ok:false,reason:"invalid"};
}
