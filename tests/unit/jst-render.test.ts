import {describe,expect,it} from "vitest";
import {readdirSync,readFileSync,statSync} from "node:fs";
import {join} from "node:path";
import {formatJstDate,parseJstDateTime} from "@/lib/jst";
// 回帰: サーバー(UTC)で日時を描画しても日本時間になること、前日/当日のずれが起きないこと
function files(dir:string):string[]{return readdirSync(dir).flatMap(f=>{const p=join(dir,f);return statSync(p).isDirectory()?files(p):/\.(ts|tsx)$/.test(f)?[p]:[]})}
describe("JST表示の回帰",()=>{
  it("日時を整形する toLocaleDateString/TimeString は必ず timeZone を指定している",()=>{
    const bad:string[]=[];
    for(const f of files("src")){
      const src=readFileSync(f,"utf8");
      for(const m of src.matchAll(/toLocale(?:Date|Time)String\([^)]*\)/g))if(!m[0].includes("timeZone"))bad.push(`${f}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
  it("UTC午前0時台(=JST朝9時)でもJSTの日付を返し、JST深夜0:30は前日扱いにならない",()=>{
    expect(formatJstDate(new Date("2026-11-04T15:30:00Z"))).toBe("2026-11-05");// JST 00:30
    expect(formatJstDate(new Date("2026-11-05T14:59:00Z"))).toBe("2026-11-05");// JST 23:59
    expect(parseJstDateTime("2026-11-05").toISOString()).toBe("2026-11-04T15:00:00.000Z");
    expect(new Date("2026-11-05T09:00:00Z").toLocaleTimeString("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit"})).toBe("18:00");
  });
});
