import {describe,expect,it} from "vitest";
import {canCompleteApproverChange,checkApproverRequest} from "@/features/ledger/approver-domain";
import {canViewLedger} from "@/features/ledger/access";
const admin={id:"a",role:"SUPER_ADMIN"},staff={id:"s",role:"RECEPTION_STAFF"};
const active={id:"n",role:"RECEPTION_STAFF",status:"ACTIVE"};
describe("決裁権者の申請ルール",()=>{
  it("初回の指定はSUPER_ADMINだけ。権限のない人・参加者・停止中アカウントは指定できない",()=>{
    expect(checkApproverRequest({actor:admin,newApprover:active,currentApproverIds:[],currentApproverId:null,emergency:false})).toBe("OK");
    expect(checkApproverRequest({actor:staff,newApprover:active,currentApproverIds:[],currentApproverId:null,emergency:false})).toBe("FORBIDDEN");
    expect(checkApproverRequest({actor:admin,newApprover:{...active,role:"PARTICIPANT"},currentApproverIds:[],currentApproverId:null,emergency:false})).toBe("INVALID_NEW");
    expect(checkApproverRequest({actor:admin,newApprover:{...active,status:"SUSPENDED"},currentApproverIds:[],currentApproverId:null,emergency:false})).toBe("INVALID_NEW");
    expect(checkApproverRequest({actor:admin,newApprover:null,currentApproverIds:[],currentApproverId:null,emergency:false})).toBe("INVALID_NEW");
  });
  it("自己昇格・同一人物・現決裁権者の指定漏れを拒否する",()=>{
    expect(checkApproverRequest({actor:admin,newApprover:{id:"a",role:"SUPER_ADMIN",status:"ACTIVE"},currentApproverIds:["c"],currentApproverId:"c",emergency:false})).toBe("SELF_PROMOTION");
    expect(checkApproverRequest({actor:admin,newApprover:{id:"c",role:"SUPER_ADMIN",status:"ACTIVE"},currentApproverIds:["c"],currentApproverId:"c",emergency:false})).toBe("SAME");
    expect(checkApproverRequest({actor:admin,newApprover:active,currentApproverIds:["c"],currentApproverId:null,emergency:false})).toBe("NEEDS_CURRENT");
    expect(checkApproverRequest({actor:admin,newApprover:active,currentApproverIds:["c"],currentApproverId:"zzz",emergency:false})).toBe("BAD_CURRENT");
  });
  it("現決裁権者は自分から交代を申請できるが、緊急フローはSUPER_ADMINのみ",()=>{
    expect(checkApproverRequest({actor:{id:"c",role:"RECEPTION_STAFF"},newApprover:active,currentApproverIds:["c"],currentApproverId:"c",emergency:false})).toBe("OK");
    expect(checkApproverRequest({actor:{id:"c",role:"RECEPTION_STAFF"},newApprover:active,currentApproverIds:["c"],currentApproverId:"c",emergency:true})).toBe("FORBIDDEN");
    expect(checkApproverRequest({actor:admin,newApprover:active,currentApproverIds:["c"],currentApproverId:"c",emergency:true})).toBe("OK");
    expect(checkApproverRequest({actor:admin,newApprover:active,currentApproverIds:[],currentApproverId:null,emergency:true})).toBe("EMERGENCY_NOT_NEEDED");
  });
});
describe("決裁権者変更の完了条件",()=>{
  const base={emergency:false,currentApproverId:"c",newApproverId:"n",currentConfirmed:true,newConfirmed:true,approvals:[] as {userId:string}[]};
  it("通常: 新決裁権者の承諾と現決裁権者の確認の両方が必要",()=>{
    expect(canCompleteApproverChange(base)).toBe(true);
    expect(canCompleteApproverChange({...base,newConfirmed:false})).toBe(false);
    expect(canCompleteApproverChange({...base,currentConfirmed:false})).toBe(false);
    expect(canCompleteApproverChange({...base,currentApproverId:null,currentConfirmed:false})).toBe(true);
  });
  it("緊急: 新決裁権者以外の2名以上の承認が必要で、新決裁権者本人の承認は数えない",()=>{
    const e={...base,emergency:true,currentConfirmed:false};
    expect(canCompleteApproverChange({...e,approvals:[{userId:"a"}]})).toBe(false);
    expect(canCompleteApproverChange({...e,approvals:[{userId:"a"},{userId:"a"}]})).toBe(false);
    expect(canCompleteApproverChange({...e,approvals:[{userId:"a"},{userId:"n"}]})).toBe(false);
    expect(canCompleteApproverChange({...e,approvals:[{userId:"a"},{userId:"b"}]})).toBe(true);
    expect(canCompleteApproverChange({...e,newConfirmed:false,approvals:[{userId:"a"},{userId:"b"}]})).toBe(false);
  });
});
describe("非公開帳簿の閲覧権限",()=>{
  it("有効な決裁権者本人だけが閲覧できる",()=>{
    const rows=[{userId:"ap",role:"APPROVER",active:true},{userId:"old",role:"APPROVER",active:false},{userId:"col",role:"COLLECTOR",active:true}];
    expect(canViewLedger("ap",rows)).toBe(true);
    for(const id of ["old","col","admin","mgr"])expect(canViewLedger(id,rows)).toBe(false);
    expect(canViewLedger("admin",[])).toBe(false);
  });
});
