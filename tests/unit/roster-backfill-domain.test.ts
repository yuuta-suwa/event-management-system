import {describe,expect,it} from "vitest";
import {MAX_ROWS,normalizeRow,parseAttendance,parseDay,parseDayTime,parseDelimited,parseMethod,parsePayment,parseRosterText,personKey,type RowContext} from "@/features/roster/backfill-domain";

const ctx:RowContext={eventYear:2026,defaults:{payment:"PAID",attendance:"ATTENDED",method:"BANK_TRANSFER",amount:null}};

describe("貼り付けデータの読み取り",()=>{
  it("タブ区切り(Excel/スプレッドシート)とカンマ区切り(CSV)を読める",()=>{
    expect(parseDelimited("a\tb\tc\n1\t2\t3")).toEqual([["a","b","c"],["1","2","3"]]);
    expect(parseDelimited("a,b,c\r\n1,2,3\r\n")).toEqual([["a","b","c"],["1","2","3"]]);
  });
  it("ダブルクォート内のカンマ・改行・二重引用符を扱い、空行は飛ばす",()=>{
    expect(parseDelimited('名前,備考\n"山田, 太郎","1行目\n2行目"\n\n"say ""hi""",x')).toEqual([["名前","備考"],["山田, 太郎","1行目\n2行目"],['say "hi"',"x"]]);
  });
  it("BOM付きでも読める",()=>{expect(parseDelimited("﻿名前,電話\nA,1")[0][0]).toBe("名前")});
});
describe("日付の読み取り",()=>{
  it("いろいろな書き方を YYYY-MM-DD にする。年がなければ開催年",()=>{
    expect(parseDay("2026-01-15",2026)).toBe("2026-01-15");
    expect(parseDay("2026/1/5",2026)).toBe("2026-01-05");
    expect(parseDay("2026年1月15日",2026)).toBe("2026-01-15");
    expect(parseDay("１／１５",2026)).toBe("2026-01-15");
    expect(parseDay("1月15日",2026)).toBe("2026-01-15");
    expect(parseDay("2026-02-30",2026)).toBeNull();
    expect(parseDay("2026-13-01",2026)).toBeNull();
    expect(parseDay("abc",2026)).toBeNull();
  });
  it("日時は時刻があれば分けて返す",()=>{
    expect(parseDayTime("2026-01-15 18:30",2026)).toEqual({day:"2026-01-15",time:"18:30"});
    expect(parseDayTime("1/15 9:05",2026)).toEqual({day:"2026-01-15",time:"09:05"});
    expect(parseDayTime("2026/1/15",2026)).toEqual({day:"2026-01-15",time:null});
    expect(parseDayTime("2026-01-15 25:00",2026)).toBeNull();
  });
});
describe("入金・出欠・方法の言い方",()=>{
  it("入金",()=>{for(const w of ["入金済み","済","○","paid","あり"])expect(parsePayment(w)).toBe("PAID");for(const w of ["未入金","未","×","なし"])expect(parsePayment(w)).toBe("UNPAID");expect(parsePayment("たぶん")).toBeNull()});
  it("出欠(「未」は未受付、「×」は欠席)",()=>{for(const w of ["参加","出席","受付済み","○"])expect(parseAttendance(w)).toBe("ATTENDED");for(const w of ["欠席","不参加","×"])expect(parseAttendance(w)).toBe("ABSENT");for(const w of ["未受付","不明","未"])expect(parseAttendance(w)).toBe("NONE");expect(parseAttendance("さあ")).toBeNull()});
  it("入金方法",()=>{expect(parseMethod("現金")).toBe("CASH");expect(parseMethod("振込")).toBe("BANK_TRANSFER");expect(parseMethod("カード")).toBe("ONLINE");expect(parseMethod("その他")).toBe("OTHER");expect(parseMethod("物々交換")).toBeNull()});
});
describe("1行の検証",()=>{
  it("名前だけで登録できる。空欄は既定で補い、フリガナは名前と同じにする",()=>{
    const r=normalizeRow({name:"  山田　太郎 "},ctx);
    expect(r.errors).toEqual([]);
    expect(r.row).toMatchObject({name:"山田 太郎",nameKana:"山田 太郎",phone:"",email:"",payment:"PAID",attendance:"ATTENDED",method:"BANK_TRANSFER",amount:null,paidAt:null,checkedInAt:null});
  });
  it("全角の電話・メールを正規化し、金額は円・カンマ付きでも読む",()=>{
    const r=normalizeRow({name:"A",phone:"０９０‐１２３４‐５６７８",email:" Taro@Example.COM ",amount:"￥3,000円",paidAt:"1/10",method:"現金",attendance:"参加",checkedInAt:"1/10 18:00"},ctx);
    expect(r.row).toMatchObject({phone:"090-1234-5678",email:"taro@example.com",amount:3000,paidAt:"2026-01-10",method:"CASH",checkedInAt:"2026-01-10T18:00"});
  });
  it("未入金なら金額・入金日は持たない。受付しない人は受付日時を持たない",()=>{
    const r=normalizeRow({name:"A",payment:"未入金",amount:"3000",paidAt:"1/10",attendance:"欠席",checkedInAt:"1/10"},ctx);
    expect(r.row).toMatchObject({payment:"UNPAID",amount:null,paidAt:null,attendance:"ABSENT",checkedInAt:null});
  });
  it("名前なし・不正な電話/メール/金額/日付/語はエラーにして、どこが悪いか書く",()=>{
    const r=normalizeRow({name:"",phone:"12",email:"x@",amount:"abc",paidAt:"2026-02-30",payment:"？",attendance:"？",method:"？"},ctx);
    expect(r.row).toBeUndefined();
    expect(r.errors.join("|")).toMatch(/名前がありません/);
    expect(r.errors.join("|")).toMatch(/電話番号/);expect(r.errors.join("|")).toMatch(/メールアドレス/);expect(r.errors.join("|")).toMatch(/金額/);expect(r.errors.join("|")).toMatch(/入金日/);
    expect(r.errors.join("|")).toMatch(/入金は/);expect(r.errors.join("|")).toMatch(/出欠は/);expect(r.errors.join("|")).toMatch(/入金方法/);
  });
  it("既定の金額・方法・出欠を使う",()=>{
    const r=normalizeRow({name:"A"},{eventYear:2026,defaults:{payment:"UNPAID",attendance:"NONE",method:"CASH",amount:2500}});
    expect(r.row).toMatchObject({payment:"UNPAID",attendance:"NONE",method:"CASH",amount:null});
    const p=normalizeRow({name:"A"},{eventYear:2026,defaults:{payment:"PAID",attendance:"ABSENT",method:"CASH",amount:2500}});
    expect(p.row).toMatchObject({payment:"PAID",amount:2500,method:"CASH",attendance:"ABSENT"});
  });
});
describe("貼り付け全体の解釈",()=>{
  it("見出しがあれば列の順番は自由。知らない列は無視する",()=>{
    const r=parseRosterText("メール\t名前\t謎の列\t入金\nA@x.com\t山田\tzzz\t未入金\n",ctx);
    expect(r.ok).toBe(true);if(!r.ok)return;
    expect(r.headerUsed).toBe(true);
    expect(r.rows[0]).toMatchObject({line:2,row:{name:"山田",email:"a@x.com",payment:"UNPAID"}});
  });
  it("見出しがなければ既定の列順(名前・フリガナ・電話・メール・入金…)で読む",()=>{
    const r=parseRosterText("山田 太郎,ヤマダ タロウ,090-1234-5678,t@example.com,入金済み,3000,2026-01-10,現金,参加",ctx);
    expect(r.ok&&r.headerUsed).toBe(false);
    expect(r.ok&&r.rows[0].row).toMatchObject({name:"山田 太郎",nameKana:"ヤマダ タロウ",phone:"090-1234-5678",email:"t@example.com",amount:3000,method:"CASH",paidAt:"2026-01-10"});
  });
  it("エラーの行があっても、ほかの行は読む。行番号は貼り付けた表の行(見出しが1行目)",()=>{
    const r=parseRosterText("名前,電話\nA,090-1234-5678\n,0\nC,",ctx);
    if(!r.ok)throw new Error("x");
    expect(r.rows.map(x=>[x.line,Boolean(x.row)])).toEqual([[2,true],[3,false],[4,true]]);
  });
  it("空・見出しだけ・多すぎはエラー",()=>{
    expect(parseRosterText("  \n ",ctx)).toMatchObject({ok:false});
    expect(parseRosterText("名前,電話",ctx)).toMatchObject({ok:false});
    expect(parseRosterText(Array.from({length:MAX_ROWS+1},(_,i)=>`P${i}`).join("\n"),ctx)).toMatchObject({ok:false});
    expect(parseRosterText(Array.from({length:MAX_ROWS},(_,i)=>`P${i}`).join("\n"),ctx).ok).toBe(true);
  });
  it("同じ人の判定キー: メール優先、なければ電話+名前、なければ名前",()=>{
    expect(personKey({name:"A",phone:"090-1",email:"a@x.com"})).toBe("e:a@x.com");
    expect(personKey({name:"A",phone:"090-1234-5678",email:""})).toBe(personKey({name:"A",phone:"09012345678",email:""}));
    expect(personKey({name:"A",phone:"",email:""})).toBe("n:A");
    expect(personKey({name:"B",phone:"09012345678",email:""})).not.toBe(personKey({name:"A",phone:"09012345678",email:""}));
  });
});
