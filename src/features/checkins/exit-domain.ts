// 退出(会場を出る)の記録まわりの純粋関数。
export const EXIT_REASONS={
  LEAVE:"帰宅・退出",
  TEMPORARY:"一時退出（再入場予定）",
  ILL:"体調不良",
  URGENT:"急用・仕事",
  TROUBLE:"トラブル・退場対応",
  OTHER:"その他（理由を記入）",
} as const;
export type ExitReason=keyof typeof EXIT_REASONS;
export const EXIT_REASON_CODES=Object.keys(EXIT_REASONS) as [ExitReason,...ExitReason[]];
export const EXIT_NOTE_MAX=200;
export const exitReasonLabel=(code:string)=>(EXIT_REASONS as Record<string,string>)[code]??code;
/** 理由コードとメモを検証する。「その他」だけはメモ必須。 */
export function normalizeExitReason(code:string,note?:string|null):{ok:true;code:ExitReason;note:string|null}|{ok:false;message:string}{
  if(!(code in EXIT_REASONS))return {ok:false,message:"退出の理由を選んでください"};
  const text=(note??"").normalize("NFKC").trim().slice(0,EXIT_NOTE_MAX);
  if(code==="OTHER"&&!text)return {ok:false,message:"「その他」の場合は、理由を入力してください"};
  return {ok:true,code:code as ExitReason,note:text||null};
}
export type ExitGate="INVALID"|"WRONG_EVENT"|"NOT_CHECKED_IN"|"ALREADY_EXITED"|"PROCEED";
/** 退出できるのは「受付済みで、まだ退出していない」参加者だけ。 */
export function decideExitGate(input:{valid:boolean;sameEvent:boolean;hasCheckin:boolean;exited:boolean}):ExitGate{
  if(!input.valid)return "INVALID";
  if(!input.sameEvent)return "WRONG_EVENT";
  if(!input.hasCheckin)return "NOT_CHECKED_IN";
  if(input.exited)return "ALREADY_EXITED";
  return "PROCEED";
}
