import {describe,expect,it} from "vitest";
import {notificationRules,beforeStartLabel} from "@/features/notifications/schedule";

describe("notification schedule",()=>{
  const event={eventDate:new Date("2026-10-21T00:00:00+09:00"),startTime:new Date("2026-10-21T21:00:00+09:00")};
  const baseConfig={eveNotificationEnabled:true,eveNotificationTime:"18:00",dayOfNotificationEnabled:false,dayOfNotificationTime:"12:00",beforeStartNotificationEnabled:true,beforeStartNotificationMinutes:180};

  it("前日18:00を計算する(TEST9)",()=>{
    const rules=notificationRules(event,baseConfig);
    const eve=rules.find(r=>r.type==="EVENT_EVE")!;
    expect(eve.scheduledAt.toISOString()).toBe(new Date("2026-10-20T18:00:00+09:00").toISOString());
  });

  it("開始3時間前/1時間前/30分前を計算する(TEST10-12)",()=>{
    expect(notificationRules(event,{...baseConfig,beforeStartNotificationMinutes:180}).find(r=>r.type==="EVENT_THREE_HOURS")!.scheduledAt.toISOString()).toBe(new Date("2026-10-21T18:00:00+09:00").toISOString());
    expect(notificationRules(event,{...baseConfig,beforeStartNotificationMinutes:60}).find(r=>r.type==="EVENT_THREE_HOURS")!.scheduledAt.toISOString()).toBe(new Date("2026-10-21T20:00:00+09:00").toISOString());
    expect(notificationRules(event,{...baseConfig,beforeStartNotificationMinutes:30}).find(r=>r.type==="EVENT_THREE_HOURS")!.scheduledAt.toISOString()).toBe(new Date("2026-10-21T20:30:00+09:00").toISOString());
  });

  it("通知OFFはenabled:falseになる(TEST13)",()=>{
    const rules=notificationRules(event,{...baseConfig,dayOfNotificationEnabled:false});
    expect(rules.find(r=>r.type==="EVENT_DAY_OF")!.enabled).toBe(false);
  });

  it("開始0:30JSTのイベントは前日扱いされない(TEST8)",()=>{
    const midnightEvent={eventDate:new Date("2026-10-21T00:00:00+09:00"),startTime:new Date("2026-10-21T00:30:00+09:00")};
    const eve=notificationRules(midnightEvent,baseConfig).find(r=>r.type==="EVENT_EVE")!;
    expect(eve.scheduledAt.toISOString()).toBe(new Date("2026-10-20T18:00:00+09:00").toISOString());
  });

  it("実障害を再現しない: 9/23 21:00JSTのイベントで前日通知が9/23 06:00JSTにならない(TEST18)",()=>{
    const incidentEvent={eventDate:new Date("2026-09-23T00:00:00+09:00"),startTime:new Date("2026-09-23T21:00:00+09:00")};
    const eve=notificationRules(incidentEvent,baseConfig).find(r=>r.type==="EVENT_EVE")!;
    const wrongInstant=new Date("2026-09-23T06:00:00+09:00");
    expect(eve.scheduledAt.getTime()).not.toBe(wrongInstant.getTime());
    expect(eve.scheduledAt.toISOString()).toBe(new Date("2026-09-22T18:00:00+09:00").toISOString());
  });

  it("開始前ラベルを整形する",()=>{
    expect(beforeStartLabel(180)).toBe("3時間前");
    expect(beforeStartLabel(60)).toBe("1時間前");
    expect(beforeStartLabel(30)).toBe("30分前");
  });
});
