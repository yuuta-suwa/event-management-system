import {describe,expect,it} from "vitest";
import {funnelMetrics} from "@/features/analytics/domain";
describe("analytics funnel",()=>{it("4つの主要率を計算する",()=>expect(funnelMetrics({capacity:100,allocated:80,assigned:60,paid:48,checkedIn:36})).toEqual({ticketConsumptionRate:75,paymentRate:80,attendanceRate:75,finalMobilizationRate:45,capacityRate:36}));it("分母0を0%として扱う",()=>expect(funnelMetrics({capacity:0,allocated:0,assigned:0,paid:0,checkedIn:0}).finalMobilizationRate).toBe(0))});
