import {describe,expect,it} from "vitest";
import {describeRosterChange,diffRoster,normalizeReason,parseRosterEdit,snapshotOf,tidyValues,withDefaults} from "@/features/roster/edit-domain";

const base={name:"山田 太郎",nameKana:"ヤマダ タロウ",phone:"",email:"",gender:"",age:"",occupation:"",referrerName:"",snsContact:"",notes:"",attendance:"NONE",checkedInAt:"",payment:"UNPAID",amount:"",method:"",paidAt:""};
describe("名簿の編集: 入力チェック",()=>{
  it("空欄は null になり、フリガナが空なら名前と同じ",()=>{
    const r=parseRosterEdit({...base,nameKana:""});
    expect(r).toMatchObject({ok:true,values:{name:"山田 太郎",nameKana:"山田 太郎",phone:null,email:null,age:null,amount:null,method:null,paidAt:null}});
  });
  it("不正な入力を項目ごとに弾く",()=>{
    const r=parseRosterEdit({...base,name:" ",phone:"1",email:"x",gender:"Z",age:"200",attendance:"??",checkedInAt:"2026-01-15",payment:"??",amount:"-1",method:"??",paidAt:"2026-02-30"});
    expect(r.ok).toBe(false);if(r.ok)return;
    for(const k of ["name","phone","email","gender","age","attendance","checkedInAt","payment","amount","method","paidAt"])expect(r.errors).toHaveProperty(k);
  });
  it("電話・メール・方法を正規化する",()=>{
    const r=parseRosterEdit({...base,phone:"０９０‐１２３４‐５６７８",email:"A@X.com",method:"現金"});
    expect(r).toMatchObject({ok:true,values:{phone:"090-1234-5678",email:"a@x.com",method:"CASH"}});
  });
});
describe("名簿の編集: 整える・補う・差分",()=>{
  it("受付していなければ受付日時を、未入金なら金額・方法・入金日を空にそろえる",()=>{
    expect(tidyValues({attendance:"ABSENT",checkedInAt:"2026-01-15T18:00",payment:"UNPAID",amount:3000,method:"CASH",paidAt:"2026-01-10"})).toMatchObject({checkedInAt:null,amount:null,method:null,paidAt:null});
  });
  it("新しく受付済み・入金済みにするとき、空欄をイベントの内容で補う",()=>{
    const d={price:3000,eventDate:"2026-01-15",startTime:"2026-01-15T18:00"};
    expect(withDefaults({attendance:"ATTENDED",checkedInAt:null,payment:"PAID",amount:null,method:null,paidAt:null},d)).toMatchObject({checkedInAt:"2026-01-15T18:00",amount:3000,method:"BANK_TRANSFER",paidAt:"2026-01-15"});
    expect(withDefaults({attendance:"ATTENDED",checkedInAt:"2026-01-15T19:10",payment:"PAID",amount:0,method:"CASH",paidAt:"2026-01-02"},d)).toMatchObject({checkedInAt:"2026-01-15T19:10",amount:0,method:"CASH",paidAt:"2026-01-02"});
  });
  it("差分は変わった項目だけ。空文字とnullは同じ",()=>{
    expect(diffRoster({name:"A",phone:null},{name:"A",phone:""})).toEqual([]);
    expect(diffRoster({name:"A",payment:"UNPAID",amount:null},{name:"B",payment:"PAID",amount:3000})).toEqual([
      {field:"name",label:"名前",before:"A",after:"B"},{field:"payment",label:"入金",before:"UNPAID",after:"PAID"},{field:"amount",label:"入金額",before:null,after:3000},
    ]);
  });
  it("履歴の表示は日本語(金額は円、入金・出欠・方法は言葉)",()=>{
    expect(describeRosterChange({field:"payment",label:"入金",before:"UNPAID",after:"PAID"})).toBe("入金: 未入金 → 入金済み");
    expect(describeRosterChange({field:"amount",label:"入金額",before:null,after:3000})).toBe("入金額: （空） → ¥3,000");
    expect(describeRosterChange({field:"attendance",label:"出欠",before:"NONE",after:"ATTENDED"})).toBe("出欠: 未受付 → 受付済み（参加）");
    expect(describeRosterChange({field:"method",label:"入金方法",before:"CASH",after:"BANK_TRANSFER"})).toBe("入金方法: 現金 → 銀行振込");
  });
  it("理由は必須。スナップショットは値が変われば変わる",()=>{
    expect(normalizeReason("  ")).toEqual({ok:false,error:"reason_required"});
    expect(normalizeReason("あ".repeat(301))).toEqual({ok:false,error:"reason_too_long"});
    expect(normalizeReason(" 追加入力 ")).toEqual({ok:true,reason:"追加入力"});
    expect(snapshotOf({a:1})).not.toBe(snapshotOf({a:2}));
  });
});
