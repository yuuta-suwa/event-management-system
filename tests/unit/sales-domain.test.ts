import {describe,expect,it} from "vitest";
import {summarizeSales} from "@/features/sales/domain";
describe("sales",()=>{it("入金済のみ売上集計する",()=>expect(summarizeSales([{paymentStatus:"PAID",amount:10000},{paymentStatus:"UNPAID",amount:10000},{paymentStatus:"PAID",amount:8000}])).toEqual({revenue:18000,paidCount:2,average:9000}));it("売上0件を安全に扱う",()=>expect(summarizeSales([])).toEqual({revenue:0,paidCount:0,average:0}))});
