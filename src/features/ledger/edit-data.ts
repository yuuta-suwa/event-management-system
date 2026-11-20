import type {Prisma} from "@prisma/client";
import {db} from "@/server/db";
import {editableFields,jstDay,type Change,type EditType,type FieldDef,type Values} from "./edit-domain";
type Client=Prisma.TransactionClient|typeof db;

export type EditTarget={
  type:EditType;id:string;eventId:string;eventName:string;title:string;
  values:Values;            // 画面に出す現在値(日付はJSTの YYYY-MM-DD)
  fields:FieldDef[];        // 直せる項目
  paidSoFar:number;         // 回収済み(参加費立替)/精算済み(経費立替)の合計。金額の下限
  status:string|null;
  linked:boolean;           // 他の記録から作られた経費(金額・項目名は直せない)
  linkedExpenseId:string|null;
};
/** 帳簿から編集する対象を読み込む。取消・無効になった記録(取消済みの立替・取消済みの経費)は編集できないので null。 */
export async function loadEditTarget(client:Client,type:EditType,id:string):Promise<EditTarget|null>{
  if(type==="EventExpense"){
    const e=await client.eventExpense.findUnique({where:{id},include:{event:{select:{name:true}},advance:{select:{id:true}},storePayment:{select:{id:true}}}});
    if(!e||e.voidedAt)return null;
    const linked=Boolean(e.advance||e.storePayment);
    return {type,id,eventId:e.eventId,eventName:e.event.name,title:e.label,values:{label:e.label,amount:e.amount,note:e.note},fields:editableFields(type,{linked}),paidSoFar:0,status:null,linked,linkedExpenseId:null};
  }
  if(type==="FeeAdvance"){
    const f=await client.feeAdvance.findUnique({where:{id},include:{event:{select:{name:true}},recoveries:{select:{amount:true}}}});
    if(!f||f.status==="CANCELLED")return null;
    return {type,id,eventId:f.eventId,eventName:f.event.name,title:`${f.advancerName}が${f.obligorName}分を立替`,values:{advancerName:f.advancerName,obligorName:f.obligorName,amount:f.amount,advancedAt:jstDay(f.advancedAt),evidenceNote:f.evidenceNote},fields:editableFields(type),paidSoFar:f.recoveries.reduce((n,r)=>n+r.amount,0),status:f.status,linked:false,linkedExpenseId:null};
  }
  const x=await client.expenseAdvance.findUnique({where:{id},include:{event:{select:{name:true}},settlements:{select:{amount:true}}}});
  if(!x||x.status==="CANCELLED")return null;
  return {type,id,eventId:x.eventId,eventName:x.event.name,title:`${x.advancerName}（${x.category}・${x.payee}）`,values:{advancerName:x.advancerName,category:x.category,payee:x.payee,amount:x.amount,paidAt:jstDay(x.paidAt),evidenceNote:x.evidenceNote},fields:editableFields(type),paidSoFar:x.settlements.reduce((n,s)=>n+s.amount,0),status:x.status,linked:false,linkedExpenseId:x.expenseId};
}

export type RevisionRow={id:string;at:Date;editor:string;type:EditType;entityId:string;summary:string;reason:string;changes:Change[]};
/** 編集履歴(新しい順)。イベント全体、または1つの記録だけ。 */
export async function listRevisions(client:Client,eventId:string,opts:{entityType?:EditType;entityId?:string;take?:number}={}):Promise<RevisionRow[]>{
  const rows=await client.ledgerRevision.findMany({where:{eventId,...(opts.entityType?{entityType:opts.entityType}:{}),...(opts.entityId?{entityId:opts.entityId}:{})},orderBy:{createdAt:"desc"},take:opts.take??200,include:{editor:{select:{name:true}}}});
  return rows.map(r=>({id:r.id,at:r.createdAt,editor:r.editor.name,type:r.entityType as EditType,entityId:r.entityId,summary:r.summary,reason:r.reason,changes:Array.isArray(r.changes)?(r.changes as unknown as Change[]):[]}));
}
