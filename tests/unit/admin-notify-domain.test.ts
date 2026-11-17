import {describe,expect,it} from "vitest";
import {DEFAULT_PREF,buildRegistrationNotice,channelsFor,dedupeKey,pickRecipients} from "@/features/admin-notify/domain";
const u=(id:string,role:string,status="ACTIVE")=>({id,role,status});
describe("管理者への登録通知: 宛先",()=>{
  it("有効なSUPER_ADMIN全員と、そのイベントの担当者だけが宛先になる",()=>{
    const users=[u("a1","SUPER_ADMIN"),u("a2","SUPER_ADMIN"),u("m1","EVENT_MANAGER"),u("m2","EVENT_MANAGER"),u("s","RECEPTION_STAFF"),u("p","PARTICIPANT")];
    expect(pickRecipients(users,{managerId:"m1"}).sort()).toEqual(["a1","a2","m1"]);
  });
  it("無効なアカウントや、担当者でないEVENT_MANAGERには送らない。担当者未設定でもSUPER_ADMINには届く",()=>{
    expect(pickRecipients([u("a1","SUPER_ADMIN","SUSPENDED"),u("m1","EVENT_MANAGER","SUSPENDED")],{managerId:"m1"})).toEqual([]);
    expect(pickRecipients([u("a1","SUPER_ADMIN"),u("m2","EVENT_MANAGER")],{managerId:null})).toEqual(["a1"]);
  });
});
describe("管理者への登録通知: チャネルと文面",()=>{
  it("既定はメールのみ。LINEは宛先が登録されているときだけ",()=>{
    expect(channelsFor(DEFAULT_PREF)).toEqual(["EMAIL"]);
    expect(channelsFor({registrationEmail:false,registrationLine:true,lineUserId:null})).toEqual([]);
    expect(channelsFor({registrationEmail:true,registrationLine:true,lineUserId:"U"+"a".repeat(32)})).toEqual(["EMAIL","LINE"]);
    expect(channelsFor({registrationEmail:false,registrationLine:false,lineUserId:"U"+"a".repeat(32)})).toEqual([]);
  });
  it("文面は「参加登録が1件ありました」で始まり、累計・定員・入金状況を含む。複数枚は枚数を併記する",()=>{
    const n=buildRegistrationNotice({eventName:"春祭り",quantity:1,total:12,paid:8,capacity:50,rosterUrl:"https://x.test/participants"});
    expect(n.text.split("\n")[0]).toBe("参加登録が1件ありました");
    expect(n.text).toContain("登録の累計：12件／定員50名（入金済 8件・未入金 4件）");
    expect(n.subject).toBe("【春祭り】参加登録が1件ありました");
    expect(buildRegistrationNotice({eventName:"e",quantity:3,total:1,paid:0,capacity:5,rosterUrl:"u"}).text).toContain("参加登録が1件ありました（3枚）");
  });
  it("HTML本文ではイベント名をエスケープする",()=>{
    expect(buildRegistrationNotice({eventName:"<b>&",quantity:1,total:1,paid:0,capacity:5,rosterUrl:"u"}).html).toContain("&lt;b&gt;&amp;");
  });
  it("二重送信防止キーは 登録×宛先×チャネル で別になる",()=>{
    expect(new Set([dedupeKey("r","u1","EMAIL"),dedupeKey("r","u1","LINE"),dedupeKey("r","u2","EMAIL"),dedupeKey("r2","u1","EMAIL")]).size).toBe(4);
  });
});
