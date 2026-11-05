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
import {isStaleReminder} from "@/features/notifications/schedule";
describe("期限切れ通知のガード",()=>{
  const now=new Date("2026-11-04T00:00:00Z");
  it("開催済みイベントの前日・当日・開始前通知は送らない",()=>{for(const type of ["EVENT_EVE","EVENT_DAY_OF","EVENT_THREE_HOURS"])expect(isStaleReminder({type,scheduledAt:new Date("2026-10-20T18:00:00Z"),eventStart:new Date("2026-10-21T05:00:00Z"),now})).toBe(true)});
  it("予定から12時間以上遅れた時間依存の通知は送らない",()=>{expect(isStaleReminder({type:"EVENT_EVE",scheduledAt:new Date("2026-11-03T08:00:00Z"),eventStart:new Date("2026-11-05T05:00:00Z"),now})).toBe(true)});
  it("予定どおりの通知と、時間に依存しない通知は送る",()=>{expect(isStaleReminder({type:"EVENT_EVE",scheduledAt:new Date("2026-11-03T23:00:00Z"),eventStart:new Date("2026-11-05T05:00:00Z"),now})).toBe(false);expect(isStaleReminder({type:"APPLICATION",scheduledAt:new Date("2026-10-01T00:00:00Z"),eventStart:new Date("2026-10-02T00:00:00Z"),now})).toBe(false);expect(isStaleReminder({type:"TICKET",scheduledAt:new Date("2026-10-01T00:00:00Z"),eventStart:new Date("2026-12-02T00:00:00Z"),now})).toBe(false)});
});

describe("JST回帰: 当日に前日通知を送らない",()=>{
  const eventStart=new Date("2026-11-05T05:00:00Z");// 11/5 14:00 JST
  it("開催日(JST)の早朝は、12時間以内の遅れでも前日通知を送らない",()=>{expect(isStaleReminder({type:"EVENT_EVE",scheduledAt:new Date("2026-11-04T09:00:00Z"),eventStart,now:new Date("2026-11-04T20:30:00Z")})).toBe(true)});
  it("開催前日の夜(JST)なら送る",()=>{expect(isStaleReminder({type:"EVENT_EVE",scheduledAt:new Date("2026-11-04T09:00:00Z"),eventStart,now:new Date("2026-11-04T09:05:00Z")})).toBe(false)});
  it("開催日の当日通知は開催日に送れる",()=>{expect(isStaleReminder({type:"EVENT_DAY_OF",scheduledAt:new Date("2026-11-05T03:00:00Z"),eventStart,now:new Date("2026-11-05T03:02:00Z")})).toBe(false)});
});
