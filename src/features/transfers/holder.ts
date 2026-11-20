// 譲渡の入力を正規化する純粋関数(全角・空白・ハイフンの揺れで弾かない)。
export const normalizePhone=(raw:string)=>raw.normalize("NFKC").replace(/[\s　]/g,"").replace(/[‐‑–—―ー−]/g,"-");
export const phoneDigits=(raw:string)=>normalizePhone(raw).replace(/\D/g,"");
export const normalizeEmail=(raw:string)=>raw.normalize("NFKC").trim().toLowerCase();
export const normalizeName=(raw:string)=>raw.normalize("NFKC").replace(/[\s　]+/g," ").trim();
export type TransferInput={ticketId:string;name:string;nameKana:string;phone:string;email:string;reason:string};
export type TransferFieldErrors=Partial<Record<"ticketId"|"name"|"nameKana"|"phone"|"email"|"reason",string>>;
/** フォーム入力を検証・正規化する。エラーはどの項目か分かる形で返す(例外は投げない)。 */
export function parseTransferInput(raw:Record<string,unknown>):{ok:true;value:TransferInput}|{ok:false;errors:TransferFieldErrors}{
  const s=(k:string)=>typeof raw[k]==="string"?(raw[k] as string):"";
  const errors:TransferFieldErrors={};
  const ticketId=s("ticketId").trim();
  const name=normalizeName(s("name"));
  const nameKana=normalizeName(s("nameKana"));
  const phone=normalizePhone(s("phone"));
  const email=normalizeEmail(s("email"));
  const reason=s("reason").normalize("NFKC").trim();
  if(!ticketId)errors.ticketId="対象のチケットを選んでください";
  if(!name)errors.name="新しい参加者名を入力してください";else if(name.length>100)errors.name="100文字以内で入力してください";
  if(!nameKana)errors.nameKana="フリガナを入力してください";else if(nameKana.length>120)errors.nameKana="120文字以内で入力してください";
  if(phoneDigits(phone).length<8||phone.length>20||!/^[0-9+()-]+$/.test(phone))errors.phone="電話番号を確認してください（例：090-1234-5678）";
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200)errors.email="メールアドレスを確認してください";
  if(reason.length<2)errors.reason="譲渡の理由を入力してください（2文字以上）";else if(reason.length>500)errors.reason="500文字以内で入力してください";
  return Object.keys(errors).length?{ok:false,errors}:{ok:true,value:{ticketId,name,nameKana,phone,email,reason}};
}
export const transferErrorMessages:Record<string,string>={
  TICKET_NOT_FOUND:"チケットが見つかりません。画面を更新してやり直してください。",
  FORBIDDEN:"このイベントのチケットを譲渡する権限がありません。",
  TICKET_NOT_TRANSFERABLE:"このチケットは譲渡できません（受付済み・使用済み・取消済みのいずれかです）。",
  SAME_HOLDER:"現在の保有者と同じ方です。別の方の情報を入力してください。",
  ALREADY_REGISTERED:"入力された方は、このイベントにすでに別のチケットで参加登録されています。別の方に譲渡するか、先に重複を整理してください。",
  TICKET_CHANGED:"ほかの操作でチケットが更新されました。画面を更新して、もう一度お試しください。",
};
