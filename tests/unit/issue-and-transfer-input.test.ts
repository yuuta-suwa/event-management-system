import {describe,expect,it} from "vitest";
import {issuePlan} from "@/features/payments/issue-domain";
import {normalizePhone,parseTransferInput,phoneDigits} from "@/features/transfers/holder";
import {canTransitionExpense,expenseStatusLabel} from "@/features/collection/domain";
import {isTransientDbError,retryTransient} from "@/server/transient";
const ok={claimed:true,status:"ACTIVE",paymentStatus:"UNPAID",hasCheckin:false};
describe("チケットの発行・送付の判定",()=>{
  it("未入金は理由を選べば発行できる(立替・入金確認は請求額、招待・無料は0円)",()=>{
    const a=issuePlan({...ok,basis:"ADVANCE"});expect(a).toMatchObject({kind:"ACTIVATE",method:"ADVANCE"});if(a.kind==="ACTIVATE")expect(a.amount(5000)).toBe(5000);
    const c=issuePlan({...ok,basis:"COMPLIMENTARY"});if(c.kind==="ACTIVATE")expect(c.amount(5000)).toBe(0);
    const b=issuePlan({...ok,paymentStatus:"PENDING",basis:"CONFIRMED"});expect(b).toMatchObject({kind:"ACTIVATE",method:"BANK_TRANSFER"});
  });
  it("理由がないと未入金は発行できない。入金済みは理由なしで再送できる",()=>{
    expect(issuePlan(ok)).toEqual({kind:"REJECT",reason:"BASIS_REQUIRED"});
    expect(issuePlan({...ok,paymentStatus:"PAID"})).toEqual({kind:"RESEND"});
  });
  it("未配布・取消・受付済み・返金済みは発行できない",()=>{
    expect(issuePlan({...ok,claimed:false,basis:"ADVANCE"})).toEqual({kind:"REJECT",reason:"NOT_CLAIMED"});
    expect(issuePlan({...ok,status:"CANCELLED",basis:"ADVANCE"})).toEqual({kind:"REJECT",reason:"CANCELLED"});
    expect(issuePlan({...ok,status:"USED",basis:"ADVANCE"})).toEqual({kind:"REJECT",reason:"USED"});
    expect(issuePlan({...ok,hasCheckin:true,paymentStatus:"PAID"})).toEqual({kind:"REJECT",reason:"USED"});
    expect(issuePlan({...ok,paymentStatus:"REFUNDED",basis:"ADVANCE"})).toEqual({kind:"REJECT",reason:"PAYMENT_CANCELLED"});
  });
});
describe("譲渡フォームの入力(例外を投げずに項目ごとのエラーを返す)",()=>{
  const good={ticketId:"t1",name:"山田 太郎",nameKana:"ヤマダ タロウ",phone:"090-1234-5678",email:"Taro@Example.com",reason:"都合"};
  it("全角・空白・ハイフンの揺れを正規化する",()=>{
    expect(normalizePhone("０９０ー１２３４ー５６７８")).toBe("090-1234-5678");
    expect(phoneDigits(" 090 1234 5678 ")).toBe("09012345678");
    const r=parseTransferInput({...good,name:"　山田　　太郎 ",email:" Taro@Example.COM ",phone:"０９０１２３４５６７８"});
    expect(r.ok&&r.value).toMatchObject({name:"山田 太郎",email:"taro@example.com",phone:"09012345678"});
  });
  it("理由は2文字から(以前は5文字未満で画面が落ちていた)",()=>{
    expect(parseTransferInput({...good,reason:"都合"}).ok).toBe(true);
    const r=parseTransferInput({...good,reason:"あ"});expect(r.ok).toBe(false);if(!r.ok)expect(r.errors.reason).toBeTruthy();
  });
  it("不正な項目はどれかが分かる",()=>{
    const r=parseTransferInput({ticketId:"",name:"",nameKana:"",phone:"12",email:"x",reason:""});
    expect(r.ok).toBe(false);if(!r.ok)expect(Object.keys(r.errors).sort()).toEqual(["email","name","nameKana","phone","reason","ticketId"]);
  });
});
describe("立替予定と一時的エラーの再試行",()=>{
  it("経費の立替予定は、実行して申請するか取り消すかだけができる(承認・差戻しには進めない)",()=>{
    expect(canTransitionExpense("PLANNED","REQUESTED")).toBe(true);expect(canTransitionExpense("PLANNED","CANCELLED")).toBe(true);
    for(const to of ["REVIEWING","APPROVED","RETURNED","SETTLED","PARTIALLY_SETTLED"] as const)expect(canTransitionExpense("PLANNED",to)).toBe(false);
    expect(expenseStatusLabel.PLANNED).toBe("立替予定");
  });
  it("一時的なDBエラーだけを再試行し、最終的に成功すれば成功にする",async()=>{
    expect(isTransientDbError({code:"P2028"})).toBe(true);expect(isTransientDbError({code:"P2002"})).toBe(false);expect(isTransientDbError(new Error("x"))).toBe(false);
    let n=0;expect(await retryTransient(async()=>{if(++n<3)throw Object.assign(new Error("t"),{code:"P2028"});return "ok"},3,1)).toBe("ok");expect(n).toBe(3);
    let m=0;await expect(retryTransient(async()=>{m++;throw Object.assign(new Error("u"),{code:"P2002"})},3,1)).rejects.toThrow("u");expect(m).toBe(1);
    let k=0;await expect(retryTransient(async()=>{k++;throw Object.assign(new Error("t"),{code:"P2028"})},2,1)).rejects.toThrow("t");expect(k).toBe(2);
  });
});
