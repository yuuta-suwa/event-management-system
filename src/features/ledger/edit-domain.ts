/** 帳簿の編集(純粋なルール)。編集できる記録・項目・入力チェック・変更前後の差分・編集理由の正規化。DBは触らない。 */
export type EditType="EventExpense"|"FeeAdvance"|"ExpenseAdvance";
export const EDIT_TYPES:readonly EditType[]=["EventExpense","FeeAdvance","ExpenseAdvance"];
export const EDIT_TYPE_LABEL:Record<EditType,string>={EventExpense:"経費",FeeAdvance:"参加費立替",ExpenseAdvance:"経費立替"};
export function isEditType(v:unknown):v is EditType{return typeof v==="string"&&(EDIT_TYPES as readonly string[]).includes(v)}

export type FieldKind="text"|"int"|"date";
export type FieldDef={key:string;label:string;kind:FieldKind;required:boolean;min?:number;max?:number;long?:boolean};
export type FieldValue=string|number|null;
export type Values=Record<string,FieldValue>;

export const EDIT_FIELDS:Record<EditType,FieldDef[]>={
  EventExpense:[
    {key:"label",label:"項目名",kind:"text",required:true,max:60},
    {key:"amount",label:"金額",kind:"int",required:true,min:0,max:100_000_000},
    {key:"note",label:"備考",kind:"text",required:false,max:300,long:true},
  ],
  FeeAdvance:[
    {key:"advancerName",label:"立て替えた人",kind:"text",required:true,max:120},
    {key:"obligorName",label:"本来の支払者",kind:"text",required:true,max:120},
    {key:"amount",label:"立替額",kind:"int",required:true,min:1,max:10_000_000},
    {key:"advancedAt",label:"立替日",kind:"date",required:true},
    {key:"evidenceNote",label:"証憑・メモ",kind:"text",required:false,max:300,long:true},
  ],
  ExpenseAdvance:[
    {key:"advancerName",label:"立て替えた人",kind:"text",required:true,max:120},
    {key:"category",label:"費目",kind:"text",required:true,max:60},
    {key:"payee",label:"支払先",kind:"text",required:true,max:120},
    {key:"amount",label:"立替額",kind:"int",required:true,min:1,max:100_000_000},
    {key:"paidAt",label:"支払日",kind:"date",required:true},
    {key:"evidenceNote",label:"証憑・メモ",kind:"text",required:false,max:300,long:true},
  ],
};
/** 他の記録(立替・店舗支払)から作られた経費は、金額・項目名を元の記録に合わせて保つため、備考だけ直せる。 */
export const LINKED_EXPENSE_FIELDS=["note"] as const;
export function editableFields(type:EditType,opts:{linked?:boolean}={}):FieldDef[]{
  const all=EDIT_FIELDS[type];
  return type==="EventExpense"&&opts.linked?all.filter(f=>(LINKED_EXPENSE_FIELDS as readonly string[]).includes(f.key)):all;
}

const DAY=/^\d{4}-\d{2}-\d{2}$/;
/** 日付はJST(日本時間)の暦日で扱う。 */
export function jstDay(d:Date){return new Date(d.getTime()+9*3600_000).toISOString().slice(0,10)}
export function dayToDate(day:string){return new Date(`${day}T00:00:00+09:00`)}
function validDay(s:string){
  if(!DAY.test(s))return false;
  const d=new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
}

export type ParseResult={ok:true;values:Values}|{ok:false;errors:Record<string,string>};
export function parseEditInput(fields:FieldDef[],raw:Record<string,unknown>):ParseResult{
  const values:Values={},errors:Record<string,string>={};
  for(const f of fields){
    const text=typeof raw[f.key]==="string"?(raw[f.key] as string).trim():"";
    if(text===""){
      if(f.required)errors[f.key]=`${f.label}を入力してください`;else values[f.key]=null;
      continue;
    }
    if(f.kind==="int"){
      const n=Number(text);
      if(!/^-?\d+$/.test(text)||!Number.isSafeInteger(n))errors[f.key]=`${f.label}は整数で入力してください`;
      else if(f.min!==undefined&&n<f.min)errors[f.key]=`${f.label}は${f.min.toLocaleString("ja-JP")}以上にしてください`;
      else if(f.max!==undefined&&n>f.max)errors[f.key]=`${f.label}は${f.max.toLocaleString("ja-JP")}以下にしてください`;
      else values[f.key]=n;
    }else if(f.kind==="date"){
      if(!validDay(text))errors[f.key]=`${f.label}は日付(年-月-日)で入力してください`;else values[f.key]=text;
    }else{
      if(f.max!==undefined&&text.length>f.max)errors[f.key]=`${f.label}は${f.max}文字以内にしてください`;else values[f.key]=text;
    }
  }
  return Object.keys(errors).length>0?{ok:false,errors}:{ok:true,values};
}

export type Change={field:string;label:string;before:FieldValue;after:FieldValue};
/** 変更前後の差分。値が同じ項目は含めない(空文字とnullは同じ扱い)。 */
export function diffChanges(fields:FieldDef[],before:Values,after:Values):Change[]{
  const norm=(v:FieldValue|undefined)=>v===undefined||v===""?null:v;
  const out:Change[]=[];
  for(const f of fields){
    if(!(f.key in after))continue;
    const b=norm(before[f.key]),a=norm(after[f.key]);
    if(b!==a)out.push({field:f.key,label:f.label,before:b,after:a});
  }
  return out;
}

export const REASON_MAX=300;
export type ReasonResult={ok:true;reason:string}|{ok:false;error:"reason_required"|"reason_too_long"};
/** 編集の理由は必須(空白だけは不可)。 */
export function normalizeReason(v:unknown):ReasonResult{
  const reason=typeof v==="string"?v.trim():"";
  if(!reason)return {ok:false,error:"reason_required"};
  if(reason.length>REASON_MAX)return {ok:false,error:"reason_too_long"};
  return {ok:true,reason};
}

/** 金額の下限チェック: 回収済み・精算済みの合計より小さい金額には直せない(帳簿の整合性が崩れるため)。 */
export function amountFloorError(type:EditType,newAmount:number,paidSoFar:number):"below_recovered"|"below_settled"|null{
  if(newAmount>=paidSoFar)return null;
  return type==="FeeAdvance"?"below_recovered":type==="ExpenseAdvance"?"below_settled":null;
}

export function formatValue(f:Pick<FieldDef,"kind">|undefined,v:FieldValue){
  if(v===null||v==="")return "（空）";
  if(f?.kind==="int"&&typeof v==="number")return `¥${v.toLocaleString("ja-JP")}`;
  return String(v);
}
export function fieldOf(type:EditType,key:string){return EDIT_FIELDS[type].find(f=>f.key===key)}
/** 履歴の1行表示用: 「金額: ¥1,000 → ¥1,200」 */
export function describeChange(type:EditType,c:Change){
  if(c.field==="status")return `${c.label}: ${statusLabel(type,c.before as string|null)} → ${statusLabel(type,c.after as string|null)}`;
  const f=fieldOf(type,c.field);
  return `${c.label}: ${formatValue(f,c.before)} → ${formatValue(f,c.after)}`;
}

/** 画面で読み込んだ時点の値と、保存時点のDBの値が同じか(他の人が先に直していないか)の判定に使う。 */
export function snapshotOf(values:Values){return JSON.stringify(Object.keys(values).sort().map(k=>[k,values[k]]))}

const FEE_STATUS_LABEL:Record<string,string>={PLANNED:"立替予定",OPEN:"未回収",PARTIALLY_RECOVERED:"一部回収済み",RECOVERED:"回収済み",CANCELLED:"取消"};
const EXPENSE_STATUS_LABEL:Record<string,string>={PLANNED:"立替予定",REQUESTED:"申請中",REVIEWING:"確認中",APPROVED:"承認済み",PARTIALLY_SETTLED:"一部精算済み",SETTLED:"精算済み",RETURNED:"差戻し",CANCELLED:"取消"};
export function statusLabel(type:EditType,status:string|null){
  if(!status)return "（なし）";
  return (type==="FeeAdvance"?FEE_STATUS_LABEL:EXPENSE_STATUS_LABEL)[status]??status;
}
/** 金額を直したとき、回収・精算の進み具合から状態を再計算する(予定・差戻し・申請中などはそのまま)。 */
export function nextStatusAfterAmountEdit(type:EditType,status:string|null,newAmount:number,paidSoFar:number):string|null{
  if(!status)return null;
  if(type==="FeeAdvance"){
    if(status==="PLANNED"||status==="CANCELLED")return status;
    return paidSoFar<=0?"OPEN":paidSoFar>=newAmount?"RECOVERED":"PARTIALLY_RECOVERED";
  }
  if(type==="ExpenseAdvance"){
    if(!["APPROVED","PARTIALLY_SETTLED","SETTLED"].includes(status))return status;
    return paidSoFar<=0?"APPROVED":paidSoFar>=newAmount?"SETTLED":"PARTIALLY_SETTLED";
  }
  return status;
}
