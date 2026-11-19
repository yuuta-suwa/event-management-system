import {describe,expect,it} from "vitest";
import {eventTicketBook,jstMonth,periodRange,summarizeBook,type EventBook} from "@/features/ledger/book-domain";
const t=(status:string,paymentStatus:string,amount=5000,attended=false)=>({status,paymentStatus,amount,attended});
describe("年次・月次の帳簿の集計",()=>{
  it("販売枚数は有効なチケットだけ。取消・返金・キャンセルは除く。売上は入金済みのみ",()=>{
    const b=eventTicketBook(5000,[t("ACTIVE","PAID",5000,true),t("USED","PAID",5000,true),t("PROVISIONAL","UNPAID"),t("CANCELLED","CANCELLED"),t("ACTIVE","REFUNDED"),t("EXPIRED","UNPAID"),t("ACTIVE","PAID",0)]);
    expect(b.tickets).toEqual({sold:4,paid:3,sales:10000,billed:20000,receivable:10000});
    expect(b.attended).toBe(2);
  });
  it("未収金はマイナスにならない(無料招待・値引きで売上が請求を上回る場合)",()=>{
    expect(eventTicketBook(1000,[t("ACTIVE","PAID",3000)]).tickets.receivable).toBe(0);
  });
  it("月はJST基準。UTCで前月になる深夜0時台も正しい月に入る",()=>{
    expect(jstMonth(new Date("2026-03-31T16:00:00Z"))).toBe(4);
    expect(jstMonth(new Date("2026-12-31T14:59:59Z"))).toBe(12);
  });
  it("期間: 月指定は翌月初まで、12月は翌年1月まで、月なしは1年間",()=>{
    const m=periodRange(2026,5);expect(m.start.toISOString()).toBe("2026-04-30T15:00:00.000Z");expect(m.end.toISOString()).toBe("2026-05-31T15:00:00.000Z");
    const d=periodRange(2026,12);expect(d.end.toISOString()).toBe("2026-12-31T15:00:00.000Z");
    const y=periodRange(2026);expect(y.start.toISOString()).toBe("2025-12-31T15:00:00.000Z");expect(y.end.toISOString()).toBe("2026-12-31T15:00:00.000Z");
    expect(periodRange(2026,13).end.toISOString()).toBe(y.end.toISOString());
  });
  it("月別に合計し、年間の合計と一致する",()=>{
    const ev=(id:string,month:number,sold:number,paid:number,sales:number,attended:number):EventBook=>({id,name:id,date:new Date(),month,price:5000,capacity:50,tickets:{sold,paid,sales,billed:sold*5000,receivable:0},attended});
    const s=summarizeBook([ev("a",1,10,8,40000,7),ev("b",1,5,5,25000,4),ev("c",12,3,1,5000,1)]);
    expect(s.months[0]).toEqual({month:1,events:2,sold:15,paid:13,sales:65000,attended:11});
    expect(s.months[11]).toMatchObject({events:1,sold:3,attended:1});
    expect(s.months[5]).toEqual({month:6,events:0,sold:0,paid:0,sales:0,attended:0});
    expect(s.totals).toEqual({events:3,sold:18,paid:14,sales:70000,attended:12});
  });
});
