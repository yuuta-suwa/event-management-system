/** 過去の参加者記録(名簿)の入力: 貼り付けデータ(Excel/スプレッドシート/CSV)の解釈と、1行ごとの検証。純粋関数でDBは触らない。 */
import {normalizeEmail,normalizeName,normalizePhone,phoneDigits} from "@/features/transfers/holder";

export type PaymentIntent="PAID"|"UNPAID";
export type AttendIntent="ATTENDED"|"ABSENT"|"NONE";
export type PayMethod="CASH"|"BANK_TRANSFER"|"ONLINE"|"OTHER";
export const PAY_METHOD_LABEL:Record<PayMethod,string>={CASH:"現金",BANK_TRANSFER:"銀行振込",ONLINE:"オンライン決済",OTHER:"その他"};
export const PAYMENT_LABEL:Record<PaymentIntent,string>={PAID:"入金済み",UNPAID:"未入金"};
export const ATTEND_LABEL:Record<AttendIntent,string>={ATTENDED:"受付済み(参加)",ABSENT:"欠席",NONE:"未受付"};
export const MAX_ROWS=300;

export type RosterDefaults={payment:PaymentIntent;attendance:AttendIntent;method:PayMethod;amount:number|null};
/** paidAt は YYYY-MM-DD、checkedInAt は YYYY-MM-DD(時刻なし)または YYYY-MM-DDTHH:mm。空ならイベントの日付・開始時刻を使う。 */
export type RosterRow={name:string;nameKana:string;phone:string;email:string;payment:PaymentIntent;amount:number|null;paidAt:string|null;method:PayMethod;attendance:AttendIntent;checkedInAt:string|null;introducer:string;notes:string};
/** name は、エラーの行でも画面に出せるように、入力された名前(整える前)を持つ。 */
export type ParsedRow={line:number;row?:RosterRow;errors:string[];name?:string};
export type RowContext={eventYear:number;defaults:RosterDefaults};

export const COLUMNS=["name","nameKana","phone","email","payment","amount","paidAt","method","attendance","checkedInAt","introducer","notes"] as const;
export type Column=typeof COLUMNS[number];
export const COLUMN_LABEL:Record<Column,string>={name:"名前",nameKana:"フリガナ",phone:"電話",email:"メール",payment:"入金",amount:"金額",paidAt:"入金日",method:"入金方法",attendance:"出欠",checkedInAt:"受付日時",introducer:"紹介者",notes:"備考"};
const ALIASES:Record<Column,string[]>={
  name:["名前","氏名","お名前","参加者","参加者名","name"],
  nameKana:["フリガナ","ふりがな","カナ","読み","よみ","namekana","kana"],
  phone:["電話","電話番号","tel","phone","携帯"],
  email:["メール","メールアドレス","email","e-mail","mail"],
  payment:["入金","入金状況","入金状態","支払","支払い","支払状況","支払い状況"],
  amount:["金額","参加費","入金額","支払額"],
  paidAt:["入金日","支払日","入金日付"],
  method:["入金方法","支払方法","方法","決済方法"],
  attendance:["出欠","出席","参加","受付","受付状況","出欠状況"],
  checkedInAt:["受付日時","受付時刻","来場時刻","来場日時","受付時間"],
  introducer:["紹介者","紹介","紹介スタッフ","紹介者名"],
  notes:["備考","メモ","note","notes","コメント"],
};
const headerKey=(s:string)=>s.normalize("NFKC").replace(/[\s　]/g,"").toLowerCase();
function columnFor(header:string):Column|null{
  const k=headerKey(header);
  for(const c of COLUMNS)if(ALIASES[c].some(a=>headerKey(a)===k))return c;
  return null;
}

/** 区切り文字付きテキストを表にする。タブ区切り(Excel/スプレッドシートからのコピー)を優先し、なければカンマ区切り。ダブルクォートで囲んだ項目内の改行・区切りも扱う。 */
export function parseDelimited(text:string):string[][]{
  const src=text.replace(/^﻿/,"").replace(/\r\n?/g,"\n");
  const firstLine=src.split("\n").find(l=>l.trim()!=="")??"";
  const delim=firstLine.includes("\t")?"\t":",";
  const rows:string[][]=[];let row:string[]=[],cell="",quoted=false,started=false;
  for(let i=0;i<src.length;i++){
    const ch=src[i];
    if(quoted){
      if(ch==='"'){if(src[i+1]==='"'){cell+='"';i++}else quoted=false}else cell+=ch;
    }else if(ch==='"'&&cell===""){quoted=true;started=true}
    else if(ch===delim){row.push(cell);cell="";started=true}
    else if(ch==="\n"){row.push(cell);if(started||row.some(c=>c.trim()!==""))rows.push(row);row=[];cell="";started=false}
    else{cell+=ch;started=true}
  }
  row.push(cell);if(started||row.some(c=>c.trim()!==""))rows.push(row);
  return rows.filter(r=>r.some(c=>c.trim()!==""));
}

const pad=(n:number)=>String(n).padStart(2,"0");
function validDay(y:number,m:number,d:number){
  if(m<1||m>12||d<1||d>31||y<1990||y>2100)return null;
  const dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?`${y}-${pad(m)}-${pad(d)}`:null;
}
/** 「2026-01-15」「2026/1/15」「2026年1月15日」「1/15」「1月15日」→ YYYY-MM-DD。年が省略されたら defaultYear(開催年)。 */
export function parseDay(raw:string,defaultYear:number):string|null{
  const s=raw.normalize("NFKC").trim();
  let m=s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if(m)return validDay(+m[1],+m[2],+m[3]);
  m=s.match(/^(\d{1,2})[/.月](\d{1,2})日?$/);
  if(m)return validDay(defaultYear,+m[1],+m[2]);
  return null;
}
/** 「2026-01-15 18:30」「1/15 18:30」「2026/1/15」→ 日付と時刻(時刻がなければ null。呼び出し側でイベントの開始時刻などを補う)。 */
export function parseDayTime(raw:string,defaultYear:number):{day:string;time:string|null}|null{
  const s=raw.normalize("NFKC").trim().replace("T"," ");
  const m=s.match(/^(.+?)(?:\s+(\d{1,2}):(\d{2}))?$/);
  if(!m)return null;
  const day=parseDay(m[1],defaultYear);if(!day)return null;
  if(m[2]===undefined)return {day,time:null};
  const h=+m[2],mi=+m[3];if(h>23||mi>59)return null;
  return {day,time:`${pad(h)}:${pad(mi)}`};
}

const PAID_WORDS=["入金済","入金済み","済","済み","支払済","支払済み","paid","○","〇","◯","あり","有","yes","y","1","true"];
const UNPAID_WORDS=["未入金","未","未払","未払い","未済","unpaid","×","✕","なし","無","no","n","0","false"];
const ATTENDED_WORDS=["受付済","受付済み","参加","出席","来場","参加済","参加済み","attended","checkedin","○","〇","◯","あり","有","yes","y","1","true"];
const ABSENT_WORDS=["欠席","不参加","欠","absent","×","✕","キャンセル"];
const NONE_WORDS=["未受付","未","不明","none","—","-","ー","未確認"];
const w=(s:string)=>s.normalize("NFKC").trim().toLowerCase().replace(/[\s　]/g,"");
export function parsePayment(raw:string):PaymentIntent|null{const v=w(raw);if(UNPAID_WORDS.includes(v))return "UNPAID";if(PAID_WORDS.includes(v))return "PAID";return null}
export function parseAttendance(raw:string):AttendIntent|null{const v=w(raw);if(ABSENT_WORDS.includes(v))return "ABSENT";if(NONE_WORDS.includes(v))return "NONE";if(ATTENDED_WORDS.includes(v))return "ATTENDED";return null}
export function parseMethod(raw:string):PayMethod|null{
  const v=w(raw);
  if(["現金","cash","手渡し","手渡"].includes(v))return "CASH";
  if(["振込","銀行振込","銀行","bank_transfer","banktransfer","bank"].includes(v))return "BANK_TRANSFER";
  if(["オンライン","オンライン決済","カード","クレジット","online","paypay","ペイペイ"].includes(v))return "ONLINE";
  if(["その他","other"].includes(v))return "OTHER";
  return null;
}
function parseAmount(raw:string):number|null|"bad"{
  const s=raw.normalize("NFKC").replace(/[¥￥,円\s]/g,"");
  if(s==="")return null;
  if(!/^\d+$/.test(s))return "bad";
  const n=Number(s);return Number.isSafeInteger(n)&&n<=100_000_000?n:"bad";
}

/** 1行(項目名→値)を検証して RosterRow にする。空欄は defaults で補う。エラーは日本語の文で返す。 */
export function normalizeRow(raw:Partial<Record<Column,string>>,ctx:RowContext):{row?:RosterRow;errors:string[]}{
  const errors:string[]=[];const g=(c:Column)=>(raw[c]??"").trim();
  const name=normalizeName(g("name"));
  if(!name)errors.push("名前がありません");else if(name.length>100)errors.push("名前は100文字以内にしてください");
  const nameKana=normalizeName(g("nameKana"))||name;
  if(nameKana.length>120)errors.push("フリガナは120文字以内にしてください");
  const phone=g("phone")?normalizePhone(g("phone")):"";
  if(phone&&(phoneDigits(phone).length<8||phone.length>20||!/^[0-9+()-]+$/.test(phone)))errors.push(`電話番号を確認してください（${g("phone")}）`);
  const email=g("email")?normalizeEmail(g("email")):"";
  if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200))errors.push(`メールアドレスを確認してください（${g("email")}）`);
  let payment=ctx.defaults.payment;
  if(g("payment")){const p=parsePayment(g("payment"));if(!p)errors.push(`入金は「入金済み」か「未入金」で入力してください（${g("payment")}）`);else payment=p}
  let attendance=ctx.defaults.attendance;
  if(g("attendance")){const a=parseAttendance(g("attendance"));if(!a)errors.push(`出欠は「参加」「欠席」「未受付」のいずれかで入力してください（${g("attendance")}）`);else attendance=a}
  let method=ctx.defaults.method;
  if(g("method")){const m=parseMethod(g("method"));if(!m)errors.push(`入金方法は「現金」「銀行振込」「オンライン決済」「その他」のいずれかで入力してください（${g("method")}）`);else method=m}
  let amount=ctx.defaults.amount;
  if(g("amount")){const a=parseAmount(g("amount"));if(a==="bad")errors.push(`金額を確認してください（${g("amount")}）`);else amount=a}
  let paidAt:string|null=null;
  if(g("paidAt")){const d=parseDay(g("paidAt"),ctx.eventYear);if(!d)errors.push(`入金日を確認してください（${g("paidAt")}）`);else paidAt=d}
  let checkedInAt:string|null=null;
  if(g("checkedInAt")){const d=parseDayTime(g("checkedInAt"),ctx.eventYear);if(!d)errors.push(`受付日時を確認してください（${g("checkedInAt")}）`);else checkedInAt=d.time?`${d.day}T${d.time}`:d.day}
  const introducer=normalizeName(g("introducer"));
  const notes=g("notes").normalize("NFKC").trim();
  if(notes.length>1000)errors.push("備考は1000文字以内にしてください");
  if(errors.length>0)return {errors};
  return {errors,row:{name,nameKana,phone,email,payment,amount:payment==="PAID"?amount:null,paidAt:payment==="PAID"?paidAt:null,method,attendance,checkedInAt:attendance==="ATTENDED"?checkedInAt:null,introducer,notes}};
}

export type ParseResult={ok:true;rows:ParsedRow[];headerUsed:boolean;columns:Column[]}|{ok:false;error:string};
/** 貼り付けテキストを行ごとに解釈する。1行目が見出し(名前・電話…)なら列を見出しで対応づけ、なければ既定の列順(COLUMNS)で読む。 */
export function parseRosterText(text:string,ctx:RowContext):ParseResult{
  const table=parseDelimited(text);
  if(table.length===0)return {ok:false,error:"貼り付けた内容が空です"};
  const mapped=table[0].map(h=>columnFor(h));
  const headerUsed=mapped.includes("name");
  const columns:Column[]=headerUsed?mapped.map((c,i)=>c??(`__skip${i}` as unknown as Column)):[...COLUMNS];
  const body=headerUsed?table.slice(1):table;
  if(body.length===0)return {ok:false,error:"見出しの下にデータの行がありません"};
  if(body.length>MAX_ROWS)return {ok:false,error:`一度に入力できるのは${MAX_ROWS}人までです（${body.length}行あります）。分けて入力してください`};
  const rows:ParsedRow[]=body.map((cells,i)=>{
    const raw:Partial<Record<Column,string>>={};
    columns.forEach((c,j)=>{if((COLUMNS as readonly string[]).includes(c)&&cells[j]!==undefined)raw[c]=cells[j]});
    const line=i+1+(headerUsed?1:0);
    return {line,name:normalizeName(raw.name??""),...normalizeRow(raw,ctx)};
  });
  return {ok:true,rows,headerUsed,columns:columns.filter(c=>(COLUMNS as readonly string[]).includes(c))};
}

/** 同じ人かどうかの鍵(メール優先。なければ電話+名前。どちらもなければ名前だけ)。 */
export function personKey(r:Pick<RosterRow,"name"|"phone"|"email">){
  if(r.email)return `e:${r.email}`;
  if(r.phone)return `p:${phoneDigits(r.phone)}|${r.name}`;
  return `n:${r.name}`;
}

export const TEMPLATE_CSV=`${COLUMNS.map(c=>COLUMN_LABEL[c]).join(",")}\r\n山田 太郎,ヤマダ タロウ,090-1234-5678,taro@example.com,入金済み,3000,2026-01-10,現金,参加,,小澤,\r\n佐藤 花子,サトウ ハナコ,,,入金済み,3000,2026-01-12,銀行振込,欠席,,,体調不良で欠席\r\n`;
