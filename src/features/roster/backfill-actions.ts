"use server";
import {db} from "@/server/db";
import {requireUser} from "@/server/authz";
import {COLUMNS,normalizeRow,parseRosterText,type AttendIntent,type Column,type ParsedRow,type PayMethod,type PaymentIntent} from "./backfill-domain";
import {canManageRoster,importRoster,loadRosterEvent,type ImportResult} from "./backfill-service";
import {jstYear} from "@/features/ledger/book-domain";

export type RosterImportState={message?:string;values?:Record<string,string>;result?:Extract<ImportResult,{ok:true}>;headerUsed?:boolean;columns?:Column[];single?:boolean};
const FIELD_NAMES=["eventId","data","defPayment","defAttendance","defMethod","defAmount",...COLUMNS] as const;
const keep=(f:FormData)=>Object.fromEntries(FIELD_NAMES.map(k=>[k,String(f.get(k)??"")]));
const oneOf=<T extends string>(v:string,list:readonly T[],fallback:T):T=>(list as readonly string[]).includes(v)?(v as T):fallback;

/** 過去の記録の入力(確認→登録)。intent=preview は保存せずに結果の見込みだけ返す。メール・LINEなどの通知は送らない。 */
export async function submitRosterImport(_:RosterImportState,formData:FormData):Promise<RosterImportState>{
  const user=await requireUser(["SUPER_ADMIN","EVENT_MANAGER"]);
  const values=keep(formData);
  const eventId=values.eventId;
  const single=formData.get("single")==="1";
  const commit=formData.get("intent")==="commit";
  const event=eventId?await loadRosterEvent(db,eventId):null;
  if(!event)return {values,single,message:"イベントを選んでください"};
  if(!canManageRoster(user,event))return {values,single,message:"このイベントの名簿を入力する権限がありません"};
  const amount=values.defAmount.trim()===""?null:Number(values.defAmount.normalize("NFKC").replace(/[,，円¥￥\s]/g,""));
  if(amount!==null&&(!Number.isSafeInteger(amount)||amount<0||amount>100_000_000))return {values,single,message:"金額（既定）は0以上の整数で入力してください"};
  const ctx={eventYear:jstYear(event.eventDate),defaults:{payment:oneOf<PaymentIntent>(values.defPayment,["PAID","UNPAID"],"PAID"),attendance:oneOf<AttendIntent>(values.defAttendance,["ATTENDED","ABSENT","NONE"],"ATTENDED"),method:oneOf<PayMethod>(values.defMethod,["CASH","BANK_TRANSFER","ONLINE","OTHER"],"BANK_TRANSFER"),amount}};
  let rows:ParsedRow[],headerUsed=false,columns:Column[]|undefined;
  if(single){
    const raw:Partial<Record<Column,string>>={};for(const c of COLUMNS)raw[c]=values[c]??"";
    rows=[{line:1,name:raw.name?.trim()||undefined,...normalizeRow(raw,ctx)}];
  }else{
    if(!values.data.trim())return {values,single,message:"記録を貼り付けてください"};
    const parsed=parseRosterText(values.data,ctx);
    if(!parsed.ok)return {values,single,message:parsed.error};
    rows=parsed.rows;headerUsed=parsed.headerUsed;columns=parsed.columns;
  }
  const result=await importRoster(user,{eventId,rows,commit});
  if(!result.ok)return {values,single,message:result.error};
  // 登録できたら入力欄は空に戻す(同じ内容をもう一度送らないため)。確認だけのときは入力を残す。
  const cleared=commit&&result.counts.errors===0?{...values,data:"",name:"",nameKana:"",phone:"",email:"",paidAt:"",checkedInAt:"",introducer:"",notes:"",amount:""}:values;
  return {values:cleared,single,result,headerUsed,columns};
}
