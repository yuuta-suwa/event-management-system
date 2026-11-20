import {Prisma} from "@prisma/client";
import {db} from "@/server/db";
import {retryTransient} from "@/server/transient";
import {ledgerAccess} from "./access";
import {loadEditTarget} from "./edit-data";
import {amountFloorError,dayToDate,diffChanges,isEditType,nextStatusAfterAmountEdit,normalizeReason,parseEditInput,snapshotOf,type Change,type EditType,type Values} from "./edit-domain";

export type EditInput={type:string;id:string;reason:unknown;fields:Record<string,unknown>;snapshot?:string};
export type EditResult={ok:true;eventId:string;changes:Change[]}|{ok:false;error:string;eventId?:string;fieldErrors?:Record<string,string>};
class EditFailure extends Error{constructor(readonly code:string,readonly fieldErrors?:Record<string,string>){super(code)}}

/** 帳簿の記録(経費・参加費立替・経費立替)を直す。理由は必須。変更前後と理由は LedgerRevision に残り、消えない。
 *  権限(帳簿を扱える人)の確認・入力チェック・他の人が先に直していないかの確認・関連する記録(立替↔経費)の同期まで、1つのトランザクションで行う。 */
export async function applyLedgerEdit(user:{id:string;role?:string},input:EditInput):Promise<EditResult>{
  const reason=normalizeReason(input.reason);
  if(!reason.ok)return {ok:false,error:reason.error};
  if(!isEditType(input.type)||!input.id)return {ok:false,error:"not_found"};
  const type:EditType=input.type;
  const pre=await loadEditTarget(db,type,input.id);
  if(!pre)return {ok:false,error:"not_found"};
  if(!await ledgerAccess(user,pre.eventId))return {ok:false,error:"forbidden"};
  try{
    const changes=await retryTransient(()=>db.$transaction(async tx=>{
      const t=await loadEditTarget(tx,type,input.id);
      if(!t)throw new EditFailure("not_found");
      if(input.snapshot!==undefined&&input.snapshot!==snapshotOf(t.values))throw new EditFailure("stale");
      const parsed=parseEditInput(t.fields,input.fields);
      if(!parsed.ok)throw new EditFailure("invalid",parsed.errors);
      const diff=diffChanges(t.fields,t.values,parsed.values);
      if(diff.length===0)throw new EditFailure("no_change");
      const merged:Values={...t.values,...parsed.values};
      const changed=new Set(diff.map(c=>c.field));
      const changes:Change[]=[...diff];
      if(typeof merged.amount==="number"&&changed.has("amount")){
        if(amountFloorError(type,merged.amount,t.paidSoFar))throw new EditFailure(amountFloorError(type,merged.amount,t.paidSoFar)!);
      }
      const data:Record<string,unknown>={};
      for(const c of diff)data[c.field]=c.field==="advancedAt"||c.field==="paidAt"?dayToDate(c.after as string):c.after;
      if(type!=="EventExpense"&&changed.has("amount")){
        const next=nextStatusAfterAmountEdit(type,t.status,merged.amount as number,t.paidSoFar);
        if(next&&next!==t.status){data.status=next;changes.push({field:"status",label:"状態",before:t.status,after:next})}
      }
      if(type==="EventExpense")await tx.eventExpense.update({where:{id:t.id},data});
      else if(type==="FeeAdvance")await tx.feeAdvance.update({where:{id:t.id},data});
      else{
        await tx.expenseAdvance.update({where:{id:t.id},data});
        // 承認済みで作られた経費(同じ立替から計上)は、金額・項目名・支払先を立替に合わせて直す(二重計上にならない)。
        if(t.linkedExpenseId){
          const sync:Record<string,unknown>={};
          if(changed.has("amount"))sync.amount=merged.amount;
          if(changed.has("category")||changed.has("advancerName"))sync.label=`${merged.category}（立替：${merged.advancerName}）`;
          if(changed.has("payee"))sync.note=`支払先：${merged.payee}`;
          if(Object.keys(sync).length>0)await tx.eventExpense.update({where:{id:t.linkedExpenseId},data:sync});
        }
      }
      await tx.ledgerRevision.create({data:{eventId:t.eventId,entityType:type,entityId:t.id,summary:t.title,reason:reason.reason,changes:changes as unknown as Prisma.InputJsonValue,editedBy:user.id}});
      await tx.auditLog.create({data:{actorId:user.id,action:"LEDGER_ENTRY_EDITED",entityType:type,entityId:t.id,before:t.values as Prisma.InputJsonValue,after:{...merged,reason:reason.reason} as Prisma.InputJsonValue}});
      return changes;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
    return {ok:true,eventId:pre.eventId,changes};
  }catch(error){
    if(error instanceof EditFailure)return {ok:false,error:error.code,eventId:pre.eventId,fieldErrors:error.fieldErrors};
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2034")return {ok:false,error:"conflict",eventId:pre.eventId};
    throw error;
  }
}

