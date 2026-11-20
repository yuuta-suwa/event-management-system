// チケットの発行・送付(手動)の判定。入金の記録がなくても、管理者が理由を選べば発行できる。
export const ISSUE_BASIS=["ADVANCE","COMPLIMENTARY","CONFIRMED"] as const;
export type IssueBasis=(typeof ISSUE_BASIS)[number];
export const issueBasisLabel:Record<IssueBasis,string>={ADVANCE:"立替で受領済み",COMPLIMENTARY:"招待・無料",CONFIRMED:"入金を確認済み"};
const METHOD:Record<IssueBasis,string>={ADVANCE:"ADVANCE",COMPLIMENTARY:"COMPLIMENTARY",CONFIRMED:"BANK_TRANSFER"};
export type IssuePlan=
  |{kind:"REJECT";reason:"NOT_CLAIMED"|"CANCELLED"|"USED"|"PAYMENT_CANCELLED"|"BASIS_REQUIRED"}
  |{kind:"ACTIVATE";basis:IssueBasis;method:string;amount:(price:number)=>number}
  |{kind:"RESEND"};
export function issuePlan(t:{claimed:boolean;status:string;paymentStatus:string;hasCheckin:boolean;basis?:IssueBasis}):IssuePlan{
  if(!t.claimed)return {kind:"REJECT",reason:"NOT_CLAIMED"};
  if(t.status==="CANCELLED"||t.status==="EXPIRED")return {kind:"REJECT",reason:"CANCELLED"};
  if(t.status==="USED"||t.hasCheckin)return {kind:"REJECT",reason:"USED"};
  if(t.paymentStatus==="CANCELLED"||t.paymentStatus==="REFUNDED")return {kind:"REJECT",reason:"PAYMENT_CANCELLED"};
  if(t.paymentStatus==="PAID")return {kind:"RESEND"};
  if(!t.basis)return {kind:"REJECT",reason:"BASIS_REQUIRED"};
  return {kind:"ACTIVATE",basis:t.basis,method:METHOD[t.basis],amount:price=>t.basis==="COMPLIMENTARY"?0:price};
}
