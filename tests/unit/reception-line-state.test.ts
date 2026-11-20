import {describe,expect,it} from "vitest";
import {formatReceptionCode,generateReceptionCode,normalizeReceptionCode} from "@/features/checkins/reception-code";
import {lineLinkState} from "@/features/line/link";
import {percentile} from "@/features/checkins/checkin-client";
describe("受付コード",()=>{
  it("6桁の数字だけを受け付け、空白・ハイフン・全角数字を正規化する",()=>{
    expect(normalizeReceptionCode("123 456")).toBe("123456");expect(normalizeReceptionCode("１２３-４５６")).toBe("123456");
    for(const bad of ["12345","1234567","12a456","","      "])expect(normalizeReceptionCode(bad)).toBeNull();
  });
  it("生成するコードは常に6桁で、表示は3桁ずつ区切る",()=>{for(let i=0;i<200;i++)expect(generateReceptionCode()).toMatch(/^\d{6}$/);expect(formatReceptionCode("012345")).toBe("012 345")});
});
describe("LINE連携状態（B-4）",()=>{
  const base={lineUserId:"U1",lineConnected:false,lineVerifiedAt:null as Date|null,friendStatus:null as string|null};
  it("未連携",()=>expect(lineLinkState({...base,lineUserId:null}).stage).toBe("NOT_LINKED"));
  it("LINEログイン成功だけでは通知可能にならない",()=>{const s=lineLinkState({...base,lineVerifiedAt:new Date(),friendStatus:"NOT_FRIEND"});expect(s).toMatchObject({verified:true,linked:true,friend:false,notifiable:false,stage:"LINKED_NOT_FRIEND"})});
  it("友だち+紐付けで通知可能",()=>expect(lineLinkState({...base,lineConnected:true,friendStatus:"FOLLOWING"})).toMatchObject({friend:true,notifiable:true,stage:"NOTIFIABLE"}));
  it("ブロック・友だち解除は通知不可",()=>expect(lineLinkState({...base,friendStatus:"BLOCKED"})).toMatchObject({blocked:true,notifiable:false,stage:"BLOCKED"}));
});
describe("パーセンタイル",()=>{it("p50/p95を求める",()=>{const v=Array.from({length:100},(_,i)=>i+1);expect(percentile(v,50)).toBe(50);expect(percentile(v,95)).toBe(95);expect(percentile([],95)).toBe(0)})});
