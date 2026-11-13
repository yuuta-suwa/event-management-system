import {describe,expect,it} from "vitest";
import {availableToRemit,canTransitionRemittance,committedRemittance,receiptOutcome,reconciledRemittance,storePaymentStatus,storeUnpaid,unreconciledRemittance} from "@/features/collection/remittance-domain";
import {custodyBalance} from "@/features/collection/domain";
describe("送金の状態遷移（T24/T25）",()=>{
  it("予定→報告→受領で照合完了、差異あり→金額訂正で照合完了",()=>{expect(canTransitionRemittance("PLANNED","SENT_REPORTED")).toBe(true);expect(canTransitionRemittance("SENT_REPORTED","RECEIVED")).toBe(true);expect(canTransitionRemittance("SENT_REPORTED","DISCREPANCY")).toBe(true);expect(canTransitionRemittance("DISCREPANCY","RECEIVED")).toBe(true)});
  it("予定のまま受領はできず、受領済み・取消からは戻れない",()=>{expect(canTransitionRemittance("PLANNED","RECEIVED")).toBe(false);expect(canTransitionRemittance("RECEIVED","CANCELLED")).toBe(false);expect(canTransitionRemittance("CANCELLED","PLANNED")).toBe(false)});
  it("送金額と受領額が一致したときだけ照合完了",()=>{expect(receiptOutcome(50000,50000)).toBe("RECEIVED");expect(receiptOutcome(50000,48000)).toBe("DISCREPANCY")});
});
describe("送金額の集計と預り金",()=>{
  const rows=[{status:"PLANNED",amount:1000},{status:"SENT_REPORTED",amount:20000},{status:"RECEIVED",amount:30000},{status:"DISCREPANCY",amount:5000},{status:"CANCELLED",amount:9000}];
  it("予定・取消は送金済みに含めず、未照合額は報告済み＋差異あり",()=>{expect(committedRemittance(rows)).toBe(55000);expect(unreconciledRemittance(rows)).toBe(25000);expect(reconciledRemittance(rows)).toBe(30000)});
  it("T26 送金は預り金を減らすだけで、売上（入金額）は変えない",()=>{const received=100000;expect(custodyBalance({received,remitted:committedRemittance(rows)})).toBe(45000);expect(custodyBalance({received})).toBe(100000)});
  it("立替の相殺は預り金から差し引き、送金可能額は預り金を超えない",()=>{expect(custodyBalance({received:100000,remitted:30000,offsets:8000})).toBe(62000);expect(availableToRemit({received:100000,committed:30000,offsets:8000})).toBe(62000);expect(availableToRemit({received:1000,committed:5000,offsets:0})).toBe(0)});
});
describe("店舗支払（T27）",()=>{
  it("一部支払・複数回支払で未払残高と状態が変わる",()=>{expect(storePaymentStatus(100000,0)).toBe("UNPAID");expect(storePaymentStatus(100000,40000)).toBe("PARTIALLY_PAID");expect(storePaymentStatus(100000,100000)).toBe("PAID");expect(storeUnpaid(100000,40000)).toBe(60000);expect(storeUnpaid(100000,120000)).toBe(0)});
});
