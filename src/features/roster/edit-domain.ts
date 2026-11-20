/** 参加者名簿の編集(純粋なルール)。参加者の情報と、このイベントでの入金・出欠を、理由つきで直す。 */
import {normalizeEmail,normalizeName,normalizePhone,phoneDigits} from "@/features/transfers/holder";
import {parseMethod,PAY_METHOD_LABEL,type PayMethod} from "./backfill-domain";

export type AttendanceValue="NONE"|"ATTENDED"|"ABSENT";
export type PaymentValue="UNPAID"|"PAID";
export type FieldValue=string|number|null;
export type Values=Record<string,FieldValue>;
export type Change={field:string;label:string;before:FieldValue;after:FieldValue};

export const PARTICIPANT_FIELDS=["name","nameKana","phone","email","gender","age","occupation","referrerName","snsContact","notes"] as const;
export const RECORD_FIELDS=["attendance","checkedInAt","payment","amount","method","paidAt"] as const;
export const FIELD_LABEL:Record<string,string>={name:"名前",nameKana:"フリガナ",phone:"電話",email:"メール",gender:"性別",age:"年齢",occupation:"職業",referrerName:"紹介者（自由記入）",snsContact:"SNS",notes:"備考",attendance:"出欠",checkedInAt:"受付日時",payment:"入金",amount:"入金額",method:"入金方法",paidAt:"入金日"};
export const GENDER_LABEL:Record<string,string>={"":"未設定",MALE:"男性",FEMALE:"女性",OTHER:"その他"};
export const ATTENDANCE_LABEL:Record<AttendanceValue,string>={NONE:"未受付",ATTENDED:"受付済み（参加）",ABSENT:"欠席"};
export const PAYMENT_VALUE_LABEL:Record<PaymentValue,string>={UNPAID:"未入金",PAID:"入金済み"};

const DAY=/^\d{4}-\d{2}-\d{2}$/,DAYTIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const okDay=(s:string)=>{if(!DAY.test(s))return false;const d=new Date(`${s}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s};
const okDayTime=(s:string)=>DAYTIME.test(s)&&okDay(s.slice(0,10))&&+s.slice(11,13)<24&&+s.slice(14,16)<60;

export type ParseResult={ok:true;values:Values}|{ok:false;errors:Record<string,string>};
/** フォームの入力を検証して、項目ごとの値にする。空欄は null(名前・フリガナを除く)。 */
export function parseRosterEdit(raw:Record<string,unknown>):ParseResult{
  const errors:Record<string,string>={};const s=(k:string)=>typeof raw[k]==="string"?(raw[k] as string).trim():"";
  const v:Values={};
  const name=normalizeName(s("name"));
  if(!name)errors.name="名前を入力してください";else if(name.length>100)errors.name="名前は100文字以内にしてください";
  v.name=name;
  const kana=normalizeName(s("nameKana"))||name;
  if(kana.length>120)errors.nameKana="フリガナは120文字以内にしてください";
  v.nameKana=kana;
  const phone=s("phone")?normalizePhone(s("phone")):"";
  if(phone&&(phoneDigits(phone).length<8||phone.length>20||!/^[0-9+()-]+$/.test(phone)))errors.phone="電話番号を確認してください";
  v.phone=phone||null;
  const email=s("email")?normalizeEmail(s("email")):"";
  if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200))errors.email="メールアドレスを確認してください";
  v.email=email||null;
  const gender=s("gender");
  if(gender&&!["MALE","FEMALE","OTHER"].includes(gender))errors.gender="性別を確認してください";
  v.gender=gender||null;
  if(s("age")===""){v.age=null}else{const n=Number(s("age"));if(!/^\d+$/.test(s("age"))||n>120)errors.age="年齢は0〜120の整数で入力してください";else v.age=n}
  for(const [k,label,max] of [["occupation","職業",120],["referrerName","紹介者",100],["snsContact","SNS",200],["notes","備考",1000]] as const){
    const t=s(k);if(t.length>max)errors[k]=`${label}は${max}文字以内にしてください`;v[k]=t||null;
  }
  const attendance=s("attendance")||"NONE";
  if(!["NONE","ATTENDED","ABSENT"].includes(attendance))errors.attendance="出欠を確認してください";
  v.attendance=attendance;
  const checkedInAt=s("checkedInAt");
  if(checkedInAt&&!okDayTime(checkedInAt))errors.checkedInAt="受付日時を確認してください";
  v.checkedInAt=checkedInAt||null;
  const payment=s("payment")||"UNPAID";
  if(!["UNPAID","PAID"].includes(payment))errors.payment="入金を確認してください";
  v.payment=payment;
  if(s("amount")===""){v.amount=null}else{const n=Number(s("amount").normalize("NFKC").replace(/[,，円¥￥\s]/g,""));if(!Number.isSafeInteger(n)||n<0||n>100_000_000)errors.amount="入金額は0以上の整数で入力してください";else v.amount=n}
  const method=s("method");
  if(method){const m=parseMethod(method);if(!m)errors.method="入金方法を確認してください";else v.method=m}else v.method=null;
  const paidAt=s("paidAt");
  if(paidAt&&!okDay(paidAt))errors.paidAt="入金日を確認してください";
  v.paidAt=paidAt||null;
  return Object.keys(errors).length>0?{ok:false,errors}:{ok:true,values:v};
}

/** 意味のない項目(受付していないのに受付日時、未入金なのに金額など)を空にそろえる。比較・保存の前に必ず通す。 */
export function tidyValues(v:Values):Values{
  const out={...v};
  if(out.attendance!=="ATTENDED")out.checkedInAt=null;
  if(out.payment!=="PAID"){out.amount=null;out.method=null;out.paidAt=null}
  return out;
}
export type RecordDefaults={price:number;eventDate:string;startTime:string};
/** 新しく「受付済み」「入金済み」にするとき、空欄だった項目をイベントの内容で補う(金額=参加費、入金日=開催日、受付日時=開始時刻)。 */
export function withDefaults(v:Values,d:RecordDefaults):Values{
  const out={...v};
  if(out.attendance==="ATTENDED"&&!out.checkedInAt)out.checkedInAt=d.startTime;
  if(out.payment==="PAID"){
    if(out.amount===null||out.amount===undefined)out.amount=d.price;
    if(!out.method)out.method="BANK_TRANSFER";
    if(!out.paidAt)out.paidAt=d.eventDate;
  }
  return out;
}
export function diffRoster(before:Values,after:Values):Change[]{
  const norm=(x:FieldValue|undefined)=>x===undefined||x===""?null:x;
  const out:Change[]=[];
  for(const k of [...PARTICIPANT_FIELDS,...RECORD_FIELDS]){
    if(!(k in after))continue;
    const b=norm(before[k]),a=norm(after[k]);
    if(b!==a)out.push({field:k,label:FIELD_LABEL[k],before:b,after:a});
  }
  return out;
}
export function snapshotOf(v:Values){return JSON.stringify(Object.keys(v).sort().map(k=>[k,v[k]??null]))}

function show(field:string,v:FieldValue){
  if(v===null||v==="")return "（空）";
  if(field==="gender")return GENDER_LABEL[String(v)]??String(v);
  if(field==="attendance")return ATTENDANCE_LABEL[v as AttendanceValue]??String(v);
  if(field==="payment")return PAYMENT_VALUE_LABEL[v as PaymentValue]??String(v);
  if(field==="method")return PAY_METHOD_LABEL[v as PayMethod]??String(v);
  if(field==="amount"&&typeof v==="number")return `¥${v.toLocaleString("ja-JP")}`;
  if(field==="checkedInAt")return String(v).replace("T"," ");
  return String(v);
}
export function describeRosterChange(c:Change){return `${c.label}: ${show(c.field,c.before)} → ${show(c.field,c.after)}`}

export const REASON_MAX=300;
export function normalizeReason(v:unknown):{ok:true;reason:string}|{ok:false;error:"reason_required"|"reason_too_long"}{
  const reason=typeof v==="string"?v.trim():"";
  if(!reason)return {ok:false,error:"reason_required"};
  if(reason.length>REASON_MAX)return {ok:false,error:"reason_too_long"};
  return {ok:true,reason};
}
