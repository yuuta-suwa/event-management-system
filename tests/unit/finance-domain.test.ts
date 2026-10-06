import {describe,expect,it} from "vitest";
import {profitOf,sumExpenses} from "@/features/sales/domain";
describe("finance",()=>{
  it("経費を合計する",()=>expect(sumExpenses([{amount:12000},{amount:8000}])).toBe(20000));
  it("経費0件を安全に扱う",()=>expect(sumExpenses([])).toBe(0));
  it("収支＝収入－支出を計算する",()=>expect(profitOf(100000,40000)).toBe(60000));
  it("支出が収入を上回ると収支は負になる",()=>expect(profitOf(10000,15000)).toBe(-5000));
});
