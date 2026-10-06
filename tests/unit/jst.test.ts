import {describe,expect,it} from "vitest";
import {parseJstDateTime,formatJstDate,formatJstDateTimeLocal} from "@/lib/jst";

describe("jst datetime utility",()=>{
  it("日時文字列をJSTとして解釈する",()=>{
    expect(parseJstDateTime("2026-10-21T21:00").toISOString()).toBe(new Date("2026-10-21T12:00:00.000Z").toISOString());
  });
  it("日付のみの文字列をJST0時として解釈する",()=>{
    expect(parseJstDateTime("2026-10-21").toISOString()).toBe(new Date("2026-10-20T15:00:00.000Z").toISOString());
  });
  it("環境のTZ設定に依存しない",()=>{
    const original=process.env.TZ;
    process.env.TZ="UTC";
    const a=parseJstDateTime("2026-10-21T21:00").getTime();
    process.env.TZ="America/Los_Angeles";
    const b=parseJstDateTime("2026-10-21T21:00").getTime();
    process.env.TZ=original;
    expect(a).toBe(b);
  });
  it("UTCインスタントをJSTの日付文字列に整形する",()=>{
    expect(formatJstDate(new Date("2026-10-20T15:00:00.000Z"))).toBe("2026-10-21");
  });
  it("UTCインスタントをJSTのdatetime-local文字列に整形する",()=>{
    expect(formatJstDateTimeLocal(new Date("2026-10-21T12:00:00.000Z"))).toBe("2026-10-21T21:00");
  });
});
