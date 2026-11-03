import {describe,expect,it,vi} from "vitest";
import {buildAuthorizeUrl,fetchLineIdentity,issueLoginState,lineLoginConfig,newNonce,sameNonce,verifyLoginState} from "@/features/line/login";
import {looksLikeLinkCode,normalizeLinkCode} from "@/features/line/link";
const secret="s".repeat(40);const now=1_800_000_000;const cfg={channelId:"1234",channelSecret:"sec",redirectUri:"https://app.example.com/api/line/login/callback"};
describe("LINE login state",()=>{
  it("有効なstateを検証できる",()=>{const s=issueLoginState({registrationId:"r1",nonce:"n1",expiresAt:now+60},secret);expect(verifyLoginState(s,secret,now)).toEqual({registrationId:"r1",nonce:"n1",expiresAt:now+60})});
  it("期限切れ・改ざん・別シークレットを拒否する",()=>{const s=issueLoginState({registrationId:"r1",nonce:"n1",expiresAt:now+60},secret);expect(verifyLoginState(s,secret,now+61)).toBeNull();const [p,,sig]=s.split(".");const forged=Buffer.from(JSON.stringify({r:"r2",n:"n1",e:now+60})).toString("base64url");expect(verifyLoginState(`${p}.${forged}.${sig}`,secret,now)).toBeNull();expect(verifyLoginState(s,"x".repeat(40),now)).toBeNull();expect(verifyLoginState("garbage",secret,now)).toBeNull()});
  it("nonceは固定長比較で照合する",()=>{expect(sameNonce("abc","abc")).toBe(true);expect(sameNonce("abc","abd")).toBe(false);expect(sameNonce(undefined,"abc")).toBe(false);expect(newNonce()).not.toBe(newNonce())});
});
describe("LINE login config / url",()=>{
  it("チャネル未設定ならnull",()=>{expect(lineLoginConfig({} as NodeJS.ProcessEnv)).toBeNull();expect(lineLoginConfig({LINE_LOGIN_CHANNEL_ID:"1"} as unknown as NodeJS.ProcessEnv)).toBeNull()});
  it("コールバックURLを組み立てる",()=>{expect(lineLoginConfig({LINE_LOGIN_CHANNEL_ID:"1",LINE_LOGIN_CHANNEL_SECRET:"s",NEXT_PUBLIC_APP_URL:"https://a.example"} as unknown as NodeJS.ProcessEnv)?.redirectUri).toBe("https://a.example/api/line/login/callback")});
  it("認可URLにstate・nonce・scopeが入る",()=>{const u=new URL(buildAuthorizeUrl(cfg,"STATE","NONCE"));expect(u.origin+u.pathname).toBe("https://access.line.me/oauth2/v2.1/authorize");expect(u.searchParams.get("state")).toBe("STATE");expect(u.searchParams.get("nonce")).toBe("NONCE");expect(u.searchParams.get("scope")).toBe("profile openid");expect(u.searchParams.get("client_id")).toBe("1234")});
});
describe("LINE login identity",()=>{
  const res=(body:unknown,ok=true,status=200)=>({ok,status,json:async()=>body}) as Response;
  it("IDトークンのsubとnonceを検証してユーザーIDを返す",async()=>{const f=vi.fn().mockResolvedValueOnce(res({id_token:"idt"})).mockResolvedValueOnce(res({sub:"U123",name:"山田",nonce:"N"}));expect(await fetchLineIdentity(cfg,"code","N",f as unknown as typeof fetch)).toEqual({userId:"U123",name:"山田"});expect(f.mock.calls[0][0]).toBe("https://api.line.me/oauth2/v2.1/token")});
  it("nonce不一致・トークン失敗を拒否する",async()=>{const f1=vi.fn().mockResolvedValueOnce(res({id_token:"idt"})).mockResolvedValueOnce(res({sub:"U1",nonce:"OTHER"}));await expect(fetchLineIdentity(cfg,"c","N",f1 as unknown as typeof fetch)).rejects.toThrow("INVALID_ID_TOKEN");const f2=vi.fn().mockResolvedValueOnce(res({},false,400));await expect(fetchLineIdentity(cfg,"c","N",f2 as unknown as typeof fetch)).rejects.toThrow("TOKEN_400")});
});
describe("連携コード",()=>{
  it("8文字のコードだけを連携コードとみなす",()=>{expect(looksLikeLinkCode("ab12 cd34")).toBe(true);expect(looksLikeLinkCode("AB12CD34")).toBe(true);expect(looksLikeLinkCode("こんにちは")).toBe(false);expect(looksLikeLinkCode("この日程でお願いします。確認してください")).toBe(false);expect(normalizeLinkCode(" ab-12 cd34 ")).toBe("AB12CD34")});
});
