import {describe,expect,it} from "vitest";
import {amountFloorError,describeChange,diffChanges,editableFields,EDIT_FIELDS,jstDay,nextStatusAfterAmountEdit,normalizeReason,parseEditInput,snapshotOf} from "@/features/ledger/edit-domain";

describe("帳簿の編集: 理由",()=>{
  it("理由は必須。空・空白だけは不可、前後の空白は除く",()=>{
    expect(normalizeReason("")).toEqual({ok:false,error:"reason_required"});
    expect(normalizeReason("   　")).toEqual({ok:false,error:"reason_required"});
    expect(normalizeReason(undefined)).toEqual({ok:false,error:"reason_required"});
    expect(normalizeReason("  領収書に合わせて訂正 ")).toEqual({ok:true,reason:"領収書に合わせて訂正"});
    expect(normalizeReason("あ".repeat(301))).toEqual({ok:false,error:"reason_too_long"});
    expect(normalizeReason("あ".repeat(300)).ok).toBe(true);
  });
});
describe("帳簿の編集: 入力チェック",()=>{
  const fee=EDIT_FIELDS.FeeAdvance;
  const ok={advancerName:"立替 花子",obligorName:"太郎",amount:"3000",advancedAt:"2026-11-19",evidenceNote:""};
  it("正しい入力は型に直る(金額は整数、空の任意項目はnull)",()=>{
    expect(parseEditInput(fee,ok)).toEqual({ok:true,values:{advancerName:"立替 花子",obligorName:"太郎",amount:3000,advancedAt:"2026-11-19",evidenceNote:null}});
  });
  it("必須の空欄・小数・負の金額・上限超え・存在しない日付・長すぎる文字を弾く",()=>{
    const bad=(o:Record<string,string>)=>{const r=parseEditInput(fee,{...ok,...o});return r.ok?{}:r.errors};
    expect(bad({advancerName:" "})).toHaveProperty("advancerName");
    expect(bad({amount:"12.5"})).toHaveProperty("amount");
    expect(bad({amount:"0"})).toHaveProperty("amount");
    expect(bad({amount:"-5"})).toHaveProperty("amount");
    expect(bad({amount:"10000001"})).toHaveProperty("amount");
    expect(bad({amount:"1e3"})).toHaveProperty("amount");
    expect(bad({advancedAt:"2026-02-30"})).toHaveProperty("advancedAt");
    expect(bad({advancedAt:"2026/11/19"})).toHaveProperty("advancedAt");
    expect(bad({evidenceNote:"あ".repeat(301)})).toHaveProperty("evidenceNote");
  });
  it("経費の金額は0円も可",()=>{
    expect(parseEditInput(EDIT_FIELDS.EventExpense,{label:"会場費",amount:"0",note:""}).ok).toBe(true);
  });
});
describe("帳簿の編集: 変更前後の差分",()=>{
  const f=EDIT_FIELDS.EventExpense;
  it("変わった項目だけを、変更前後つきで返す。空文字とnullは同じ",()=>{
    const before={label:"会場費",amount:1000,note:null};
    expect(diffChanges(f,before,{label:"会場費",amount:1000,note:null})).toEqual([]);
    expect(diffChanges(f,before,{label:"会場費",amount:1000,note:""})).toEqual([]);
    expect(diffChanges(f,before,{label:"会場費(訂正)",amount:1200,note:"領収書"})).toEqual([
      {field:"label",label:"項目名",before:"会場費",after:"会場費(訂正)"},
      {field:"amount",label:"金額",before:1000,after:1200},
      {field:"note",label:"備考",before:null,after:"領収書"},
    ]);
  });
  it("履歴の1行表示は金額を円で、空は（空）で出す",()=>{
    expect(describeChange("EventExpense",{field:"amount",label:"金額",before:1000,after:12000})).toBe("金額: ¥1,000 → ¥12,000");
    expect(describeChange("EventExpense",{field:"note",label:"備考",before:null,after:"領収書"})).toBe("備考: （空） → 領収書");
    expect(describeChange("FeeAdvance",{field:"status",label:"状態",before:"OPEN",after:"RECOVERED"})).toBe("状態: 未回収 → 回収済み");
  });
});
describe("帳簿の編集: 直せる項目・金額の下限・状態の再計算",()=>{
  it("他の記録から作られた経費は備考だけ直せる。単独の経費は全項目",()=>{
    expect(editableFields("EventExpense",{linked:true}).map(f=>f.key)).toEqual(["note"]);
    expect(editableFields("EventExpense").map(f=>f.key)).toEqual(["label","amount","note"]);
  });
  it("回収済み・精算済みより小さい立替額には直せない",()=>{
    expect(amountFloorError("FeeAdvance",999,1000)).toBe("below_recovered");
    expect(amountFloorError("FeeAdvance",1000,1000)).toBeNull();
    expect(amountFloorError("ExpenseAdvance",500,600)).toBe("below_settled");
    expect(amountFloorError("EventExpense",0,999)).toBeNull();
  });
  it("参加費立替: 回収の進み具合から状態を再計算(予定・取消はそのまま)",()=>{
    expect(nextStatusAfterAmountEdit("FeeAdvance","OPEN",5000,0)).toBe("OPEN");
    expect(nextStatusAfterAmountEdit("FeeAdvance","RECOVERED",5000,3000)).toBe("PARTIALLY_RECOVERED");
    expect(nextStatusAfterAmountEdit("FeeAdvance","PARTIALLY_RECOVERED",3000,3000)).toBe("RECOVERED");
    expect(nextStatusAfterAmountEdit("FeeAdvance","PLANNED",9999,0)).toBe("PLANNED");
  });
  it("経費立替: 承認後だけ精算状況から再計算。申請中・差戻し・予定は動かさない",()=>{
    expect(nextStatusAfterAmountEdit("ExpenseAdvance","SETTLED",5000,4000)).toBe("PARTIALLY_SETTLED");
    expect(nextStatusAfterAmountEdit("ExpenseAdvance","PARTIALLY_SETTLED",4000,4000)).toBe("SETTLED");
    expect(nextStatusAfterAmountEdit("ExpenseAdvance","APPROVED",9000,0)).toBe("APPROVED");
    for(const s of ["PLANNED","REQUESTED","REVIEWING","RETURNED"])expect(nextStatusAfterAmountEdit("ExpenseAdvance",s,1,0)).toBe(s);
  });
});
describe("帳簿の編集: 日付・スナップショット",()=>{
  it("日付はJSTの暦日で扱う",()=>{
    expect(jstDay(new Date("2026-11-18T15:00:00Z"))).toBe("2026-11-19");
    expect(jstDay(new Date("2026-11-19T14:59:59Z"))).toBe("2026-11-19");
  });
  it("スナップショットは項目の並びに依存せず、値が変われば変わる",()=>{
    expect(snapshotOf({a:1,b:"x"})).toBe(snapshotOf({b:"x",a:1}));
    expect(snapshotOf({a:1,b:"x"})).not.toBe(snapshotOf({a:2,b:"x"}));
  });
});
