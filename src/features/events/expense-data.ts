import {db} from "@/server/db";
import {isLocalDemo} from "@/server/authz";
export type ExpenseRow={id:string;label:string;amount:number;note:string|null;createdAt:Date};
const demo:ExpenseRow[]=[
  {id:"ex1",label:"会場費",amount:120000,note:null,createdAt:new Date("2026-08-01")},
  {id:"ex2",label:"印刷費",amount:18000,note:"招待状・名札",createdAt:new Date("2026-08-05")},
];
export async function listExpenses(eventId:string):Promise<ExpenseRow[]>{
  if(isLocalDemo())return demo;
  return db.eventExpense.findMany({where:{eventId},orderBy:{createdAt:"desc"}});
}
