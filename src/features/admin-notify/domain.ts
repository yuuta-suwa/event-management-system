// 管理者への「参加登録があったとき」の通知: 文面と宛先のルール(純粋関数)。
export type Channel="EMAIL"|"LINE";
export type Pref={registrationEmail:boolean;registrationLine:boolean;lineUserId:string|null};
/** 設定の行がない管理者の既定値: メールのみ有効(LINEは宛先を登録するまで送らない)。 */
export const DEFAULT_PREF:Pref={registrationEmail:true,registrationLine:false,lineUserId:null};
export type Recipient={id:string;role:string;status:string};
/** 通知先: 有効なSUPER_ADMIN全員と、そのイベントの担当者(EVENT_MANAGER/SUPER_ADMIN)。受付スタッフ・参加者には送らない。 */
export function pickRecipients(users:Recipient[],event:{managerId:string|null}){
  return users.filter(u=>u.status==="ACTIVE"&&(u.role==="SUPER_ADMIN"||(u.role==="EVENT_MANAGER"&&u.id===event.managerId))).map(u=>u.id);
}
/** 設定から、実際に送るチャネルを決める。LINEは宛先(LINEユーザーID)が登録されているときだけ。 */
export function channelsFor(pref:Pref):Channel[]{
  const out:Channel[]=[];
  if(pref.registrationEmail)out.push("EMAIL");
  if(pref.registrationLine&&pref.lineUserId)out.push("LINE");
  return out;
}
export const dedupeKey=(registrationId:string,userId:string,channel:Channel)=>`ADMIN_REG:${registrationId}:${userId}:${channel}`;
export type NoticeInput={eventName:string;quantity:number;total:number;paid:number;capacity:number;rosterUrl:string};
/** 通知文面。個人情報(氏名・電話・メール)は載せない。詳細は認証が必要な名簿で確認する。 */
export function buildRegistrationNotice(i:NoticeInput){
  const head=`参加登録が1件ありました${i.quantity>1?`（${i.quantity}枚）`:""}`;
  const lines=[head,"",`イベント：${i.eventName}`,`登録の累計：${i.total}件／定員${i.capacity}名（入金済 ${i.paid}件・未入金 ${i.total-i.paid}件）`,"",`▼ 参加者名簿（ログインが必要です）`,i.rosterUrl];
  const text=lines.join("\n");
  const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const html=`<div style="font-family:sans-serif;line-height:1.7;color:#17312f;max-width:520px"><p><strong>${esc(head)}</strong></p><p>イベント：${esc(i.eventName)}<br>登録の累計：${i.total}件／定員${i.capacity}名（入金済 ${i.paid}件・未入金 ${i.total-i.paid}件）</p><p><a href="${esc(i.rosterUrl)}">参加者名簿を開く</a>（ログインが必要です）</p></div>`;
  return {subject:`【${i.eventName}】${head}`,text,html,lineText:text};
}
