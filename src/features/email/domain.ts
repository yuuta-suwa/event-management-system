export type EmailKind="REGISTRATION_COMPLETE"|"TICKET_ACTIVATED"|"TRANSFER_RECEIVED"|"MANUAL_RESEND";
export const MAX_ATTEMPTS=3;
export const RESEND_LIMIT_PER_DAY=3;
/** QR・受付コードを載せてよいのは「入金確認済みで有効なチケット」だけ。 */
export function ticketIsDeliverable(t:{paymentStatus:string;status:string;claimed:boolean}){return t.claimed&&t.paymentStatus==="PAID"&&t.status==="ACTIVE"}
/** 同じ保有者・同じQR版数・同じ種別のメールは自動送信では1回だけ(二重送信防止)。 */
export function autoDedupeKey(kind:EmailKind,ticketId:string,participantId:string,qrVersion:number){return `${kind}:${ticketId}:${participantId}:v${qrVersion}`}
export function canResend(sentLast24h:number){return sentLast24h<RESEND_LIMIT_PER_DAY}
export function maskAddress(email:string){const [l,d]=email.split("@");return d?`${l.slice(0,2)}***@${d}`:"***"}
export type TicketMailData={kind:EmailKind;participantName:string;eventName:string;startTime:Date;endTime:Date;venueName:string;address:string;ticketNumber:string;myPageUrl:string;ticketUrl:string|null;receptionCode:string|null;organizer:string;contact:string|null};
const jst=(d:Date,opts:Intl.DateTimeFormatOptions)=>d.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",...opts});
const date=(d:Date)=>jst(d,{year:"numeric",month:"long",day:"numeric",weekday:"short"});
const time=(d:Date)=>jst(d,{hour:"2-digit",minute:"2-digit"});
const head:Record<EmailKind,{subject:(e:string)=>string;intro:string}>={
  REGISTRATION_COMPLETE:{subject:e=>`【${e}】お申し込みを受け付けました`,intro:"お申し込みありがとうございます。参加登録を受け付けました。入金の確認後、QRチケットを改めてお送りします。"},
  TICKET_ACTIVATED:{subject:e=>`【${e}】ご入金を確認しました（QRチケット）`,intro:"ご入金を確認し、QRチケットを有効にしました。当日は下記のQRコードまたは受付コードをご提示ください。"},
  TRANSFER_RECEIVED:{subject:e=>`【${e}】チケットを受け取りました`,intro:"チケットの受け取りを確認しました。以前の保有者のQRコードは無効になり、このメールのチケットが有効です。"},
  MANUAL_RESEND:{subject:e=>`【${e}】チケットを再送します`,intro:"ご依頼のチケット情報を再送します。"},
};
/** 本文に載せる個人情報は最小限(氏名・チケット番号のみ。電話番号・メールアドレスは載せない)。 */
export function buildTicketEmail(d:TicketMailData){
  const h=head[d.kind];
  const lines=[
    `${d.participantName} 様`,"",h.intro,"",
    `■ イベント：${d.eventName}`,
    `■ 開催日時：${date(d.startTime)} ${time(d.startTime)}〜${time(d.endTime)}`,
    `■ 開催場所：${d.venueName}（${d.address}）`,
    `■ チケット番号：${d.ticketNumber}`,
  ];
  if(d.ticketUrl){lines.push("","▼ QRチケットを表示する（当日はこの画面を受付で提示）",d.ticketUrl)}
  if(d.receptionCode){lines.push("",`▼ 受付コード（QRが使えないとき）：${d.receptionCode.slice(0,3)} ${d.receptionCode.slice(3)}`)}
  lines.push("","▼ マイページ（申込内容の確認・LINE連携・チケットの配布や譲渡）",d.myPageUrl,"","このメールは、チケットの保有者としてご登録いただいたアドレスにお送りしています。QRコード・受付コード・上記URLは他の方に共有しないでください。",`主催：${d.organizer}${d.contact?`\nお問い合わせ：${d.contact}`:""}`);
  const text=lines.join("\n");
  const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const html=`<div style="font-family:sans-serif;line-height:1.7;color:#17312f;max-width:560px"><p>${esc(d.participantName)} 様</p><p>${esc(h.intro)}</p><table style="border-collapse:collapse"><tr><td style="padding:2px 12px 2px 0;color:#6b7d7b">イベント</td><td>${esc(d.eventName)}</td></tr><tr><td style="padding:2px 12px 2px 0;color:#6b7d7b">開催日時</td><td>${esc(date(d.startTime))} ${esc(time(d.startTime))}〜${esc(time(d.endTime))}</td></tr><tr><td style="padding:2px 12px 2px 0;color:#6b7d7b">開催場所</td><td>${esc(d.venueName)}（${esc(d.address)}）</td></tr><tr><td style="padding:2px 12px 2px 0;color:#6b7d7b">チケット番号</td><td>${esc(d.ticketNumber)}</td></tr></table>${d.ticketUrl?`<p><a href="${esc(d.ticketUrl)}" style="display:inline-block;padding:12px 18px;background:#0d766e;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">QRチケットを表示する</a></p>`:""}${d.receptionCode?`<p>受付コード（QRが使えないとき）：<strong style="font-size:20px;letter-spacing:.2em">${esc(d.receptionCode.slice(0,3))} ${esc(d.receptionCode.slice(3))}</strong></p>`:""}<p><a href="${esc(d.myPageUrl)}">マイページを開く</a>（申込内容の確認・LINE連携・チケットの配布や譲渡）</p><p style="color:#6b7d7b;font-size:12px">このメールは、チケットの保有者としてご登録いただいたアドレスにお送りしています。QRコード・受付コード・URLは他の方に共有しないでください。<br/>主催：${esc(d.organizer)}${d.contact?`<br/>お問い合わせ：${esc(d.contact)}`:""}</p></div>`;
  return {subject:h.subject(d.eventName),text,html};
}
