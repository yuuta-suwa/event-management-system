// 決裁権者の指定・変更ルール(純粋関数)。
export type Actor={id:string;role:string};
export type RequestInput={actor:Actor;newApprover:{id:string;role:string;status:string}|null;currentApproverIds:string[];currentApproverId:string|null;emergency:boolean};
export type RequestCheck="OK"|"FORBIDDEN"|"INVALID_NEW"|"SELF_PROMOTION"|"NEEDS_CURRENT"|"BAD_CURRENT"|"SAME"|"EMERGENCY_NOT_NEEDED";
export function checkApproverRequest(i:RequestInput):RequestCheck{
  const isAdmin=i.actor.role==="SUPER_ADMIN";
  const isCurrent=i.currentApproverIds.includes(i.actor.id);
  if(!isAdmin&&!isCurrent)return "FORBIDDEN";
  if(i.emergency&&!isAdmin)return "FORBIDDEN";
  if(!i.newApprover||i.newApprover.status!=="ACTIVE"||i.newApprover.role==="PARTICIPANT")return "INVALID_NEW";
  if(i.currentApproverIds.includes(i.newApprover.id))return "SAME";
  // 自己昇格の禁止: 既に決裁権者がいるイベントで、本人が自分を決裁権者にする申請はできない
  if(i.currentApproverIds.length>0&&i.actor.id===i.newApprover.id)return "SELF_PROMOTION";
  if(i.currentApproverIds.length>0){
    if(!i.currentApproverId)return "NEEDS_CURRENT";
    if(!i.currentApproverIds.includes(i.currentApproverId))return "BAD_CURRENT";
  }else if(i.emergency)return "EMERGENCY_NOT_NEEDED";
  return "OK";
}
export const EMERGENCY_APPROVALS_REQUIRED=2;
export type CompletionState={emergency:boolean;currentApproverId:string|null;newApproverId:string;currentConfirmed:boolean;newConfirmed:boolean;approvals:{userId:string}[]};
/** 新決裁権者の本人確認は常に必須。通常は現決裁権者の確認、緊急時は新決裁権者以外のSUPER_ADMIN2名以上の承認が必要。 */
export function canCompleteApproverChange(s:CompletionState){
  if(!s.newConfirmed)return false;
  if(!s.currentApproverId)return true;
  if(s.emergency){
    const ids=new Set(s.approvals.map(a=>a.userId).filter(id=>id!==s.newApproverId));
    return ids.size>=EMERGENCY_APPROVALS_REQUIRED;
  }
  return s.currentConfirmed;
}
