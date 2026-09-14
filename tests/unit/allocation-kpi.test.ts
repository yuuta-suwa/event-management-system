import {describe,expect,it} from "vitest";
import {calculateAllocationKpis} from "@/features/staff/metrics";
describe("staff allocation KPI",()=>{it("要件どおり4つの率と残数を計算する",()=>expect(calculateAllocationKpis({allocated:10,assigned:7,paid:6,checkedIn:5})).toEqual({consumptionRate:70,paymentRate:86,attendanceRate:83,finalMobilizationRate:50,remaining:3}));it("分母0を0%として安全に扱う",()=>expect(calculateAllocationKpis({allocated:0,assigned:0,paid:0,checkedIn:0})).toEqual({consumptionRate:0,paymentRate:0,attendanceRate:0,finalMobilizationRate:0,remaining:0}))});
