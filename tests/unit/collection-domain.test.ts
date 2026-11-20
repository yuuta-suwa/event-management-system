import {describe,expect,it} from "vitest";
import {canTransitionExpense,custodyBalance,decideAccess,feeAdvanceStatus,settlementStatus,summarizeBilling,unsettled} from "@/features/collection/domain";
describe("集金計算",()=>{
  it("T19/T20 部分入金・分割入金と未収金",()=>{expect(summarizeBilling(30000,[])).toEqual({billed:30000,received:0,unpaid:30000,status:"UNPAID"});expect(summarizeBilling(30000,[10000,5000])).toEqual({billed:30000,received:15000,unpaid:15000,status:"PARTIAL"});expect(summarizeBilling(30000,[10000,20000]).status).toBe("PAID");expect(summarizeBilling(30000,[40000])).toMatchObject({unpaid:0,status:"OVERPAID"})});
  it("預り金残高は入金から送金を引く",()=>{expect(custodyBalance({received:50000})).toBe(50000);expect(custodyBalance({received:50000,remitted:20000})).toBe(30000)});
});
describe("参加費立替の状態",()=>{
  it("回収額に応じて状態が変わる",()=>{expect(feeAdvanceStatus(10000,0)).toBe("OPEN");expect(feeAdvanceStatus(10000,4000)).toBe("PARTIALLY_RECOVERED");expect(feeAdvanceStatus(10000,10000)).toBe("RECOVERED");expect(feeAdvanceStatus(10000,0,true)).toBe("CANCELLED")});
});
describe("経費立替の状態遷移（T22/T23）",()=>{
  it("申請→確認→承認→一部精算→精算済み",()=>{expect(canTransitionExpense("REQUESTED","REVIEWING")).toBe(true);expect(canTransitionExpense("REVIEWING","APPROVED")).toBe(true);expect(canTransitionExpense("APPROVED","PARTIALLY_SETTLED")).toBe(true);expect(canTransitionExpense("PARTIALLY_SETTLED","SETTLED")).toBe(true)});
  it("差戻しは再申請でき、精算済み・取消からは戻れない",()=>{expect(canTransitionExpense("RETURNED","REQUESTED")).toBe(true);expect(canTransitionExpense("SETTLED","APPROVED")).toBe(false);expect(canTransitionExpense("CANCELLED","REQUESTED")).toBe(false);expect(canTransitionExpense("REQUESTED","SETTLED")).toBe(false);expect(canTransitionExpense("APPROVED","CANCELLED")).toBe(false)});
  it("精算額に応じた状態と未精算残高",()=>{expect(settlementStatus(10000,0)).toBe("APPROVED");expect(settlementStatus(10000,3000)).toBe("PARTIALLY_SETTLED");expect(settlementStatus(10000,10000)).toBe("SETTLED");expect(unsettled(10000,3000)).toBe(7000);expect(unsettled(10000,12000)).toBe(0)});
});
describe("イベント別アクセス判定",()=>{
  const base={managerId:"mgr",assignments:[{userId:"col",role:"COLLECTOR" as const,active:true},{userId:"old",role:"COLLECTOR" as const,active:false}]};
  it("T28 担当外のユーザーは何も見られない",()=>{expect(decideAccess({...base,role:"RECEPTION_STAFF",userId:"stranger"}).canView).toBe(false);expect(decideAccess({...base,role:"EVENT_MANAGER",userId:"other-manager"}).canView).toBe(false);expect(decideAccess({...base,role:"RECEPTION_STAFF",userId:"old"}).canView).toBe(false)});
  it("集金担当は集金のみ、イベント管理者は管理のみ",()=>{const c=decideAccess({...base,role:"RECEPTION_STAFF",userId:"col"});expect(c).toMatchObject({collector:true,manager:false,approver:false});const m=decideAccess({...base,role:"EVENT_MANAGER",userId:"mgr"});expect(m).toMatchObject({manager:true,approver:false,collector:false})});
  it("承認者が未設定のイベントに限りSUPER_ADMINが暫定承認できる",()=>{expect(decideAccess({...base,role:"SUPER_ADMIN",userId:"admin"})).toMatchObject({approver:true,approverFallback:true});const withApprover={...base,assignments:[...base.assignments,{userId:"appr",role:"APPROVER" as const,active:true}]};expect(decideAccess({...withApprover,role:"SUPER_ADMIN",userId:"admin"}).approver).toBe(false);expect(decideAccess({...withApprover,role:"RECEPTION_STAFF",userId:"appr"})).toMatchObject({approver:true,approverFallback:false})});
  it("イベント管理者は決裁権者になれない（自己昇格不可）",()=>{expect(decideAccess({...base,role:"EVENT_MANAGER",userId:"mgr"}).approver).toBe(false)});
});
import {targetSummary} from "@/features/collection/domain";
describe("注文・チケット単位の集計",()=>{
  const t=(s:string)=>({paymentStatus:s});
  it("既存の入金済みチケット（入金記録なし）は請求額どおり回収済みとして扱う",()=>{expect(targetSummary(10000,[t("PAID"),t("PAID")],[])).toMatchObject({billed:20000,received:20000,unpaid:0,status:"PAID",manualPaid:true})});
  it("入金記録があればその合計を実入金額とする",()=>{expect(targetSummary(10000,[t("UNPAID"),t("UNPAID"),t("UNPAID")],[10000,5000])).toMatchObject({billed:30000,received:15000,unpaid:15000,status:"PARTIAL",manualPaid:false})});
  it("入金記録が請求額に達し全チケットが入金済みなら完了",()=>{expect(targetSummary(10000,[t("PAID"),t("PAID")],[12000,8000])).toMatchObject({received:20000,unpaid:0,status:"PAID",manualPaid:false})});
  it("手動で全件入金確認済みにした場合は未収を残さない",()=>{expect(targetSummary(10000,[t("PAID"),t("PAID")],[5000])).toMatchObject({received:20000,unpaid:0,status:"PAID",manualPaid:true})});
  it("一部だけ手動で入金確認済みの注文は、その分を重複して請求しない",()=>{expect(targetSummary(10000,[t("PAID"),t("UNPAID"),t("UNPAID")],[15000])).toMatchObject({billed:30000,received:25000,unpaid:5000,status:"PARTIAL"});expect(targetSummary(10000,[t("PAID"),t("UNPAID"),t("UNPAID")],[])).toMatchObject({received:10000,unpaid:20000})});
});
