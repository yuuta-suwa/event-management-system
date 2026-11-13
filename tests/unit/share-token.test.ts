import {describe,expect,it} from "vitest";
import {issueShareToken,shareExpiry,verifyShareToken} from "@/features/tickets/share-token";
import {canShareTicket} from "@/features/transfers/domain";
const secret="s".repeat(40);const now=1_800_000_000;
describe("share token",()=>{
  it("有効期限内のトークンを検証できる",()=>{const t=issueShareToken({ticketId:"t1",shareVersion:2,expiresAt:now+100},secret);expect(verifyShareToken(t,secret,now)).toEqual({ticketId:"t1",shareVersion:2,expiresAt:now+100})});
  it("期限切れを拒否する",()=>{const t=issueShareToken({ticketId:"t1",shareVersion:0,expiresAt:now-1},secret);expect(verifyShareToken(t,secret,now)).toBeNull()});
  it("改ざんと別シークレットを拒否する",()=>{const t=issueShareToken({ticketId:"t1",shareVersion:0,expiresAt:now+100},secret);const [p,body,sig]=t.split(".");const forged=Buffer.from(JSON.stringify({t:"t2",v:0,e:now+100})).toString("base64url");expect(verifyShareToken(`${p}.${forged}.${sig}`,secret,now)).toBeNull();expect(verifyShareToken(t,"x".repeat(40),now)).toBeNull();expect(body).toBeTruthy()});
  it("旧claimトークンや不正形式を拒否する",()=>{expect(verifyShareToken("clm1.a.b",secret,now)).toBeNull();expect(verifyShareToken("garbage",secret,now)).toBeNull()});
  it("有効期限は日単位で安定する",()=>{expect(shareExpiry(7,86400000*10+5)).toBe(shareExpiry(7,86400000*10+86000000))});
});
describe("canShareTicket",()=>{
  it("入金承認済み(ACTIVE)・未受付なら譲渡できる",()=>expect(canShareTicket({status:"ACTIVE",hasCheckin:false,eventPublished:true})).toBe(true));
  it("承認前(PROVISIONAL)でも配布できる",()=>expect(canShareTicket({status:"PROVISIONAL",hasCheckin:false,eventPublished:true})).toBe(true));
  it("受付済み・使用済み・取消・期限切れ・非公開イベントは不可",()=>{expect(canShareTicket({status:"ACTIVE",hasCheckin:true,eventPublished:true})).toBe(false);for(const status of ["USED","CANCELLED","EXPIRED","TRANSFERRED"] as const)expect(canShareTicket({status,hasCheckin:false,eventPublished:true})).toBe(false);expect(canShareTicket({status:"ACTIVE",hasCheckin:false,eventPublished:false})).toBe(false)});
});
