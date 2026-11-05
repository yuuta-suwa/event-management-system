import {db} from "@/server/db";

/** 非公開帳簿: そのイベントの「有効な決裁権者」本人だけが閲覧できる。SUPER_ADMIN でも決裁権者でなければ不可(暫定承認の代理権限は帳簿には及ばない)。 */
export function canViewLedger(userId:string,assignments:{userId:string;role:string;active:boolean}[]){
  return assignments.some(a=>a.active&&a.role==="APPROVER"&&a.userId===userId);
}
export async function ledgerAccess(userId:string,eventId:string){
  const assignments=await db.eventRoleAssignment.findMany({where:{eventId,role:"APPROVER",active:true},select:{userId:true,role:true,active:true}});
  return canViewLedger(userId,assignments);
}
/** サーバー側認可。帳簿画面・API・Server Action・CSV・印刷の入口で必ず呼ぶ。 */
export async function assertLedgerAccess(userId:string,eventId:string){
  if(!await ledgerAccess(userId,eventId))throw new Error("FORBIDDEN");
}
/** 決裁権者が指定されたイベントの収支(売上・経費・利益)は、その決裁権者以外には表示しない。未指定のイベントは従来どおり。 */
export async function privateEventIdsFor(viewerId:string):Promise<Set<string>>{
  const rows=await db.eventRoleAssignment.findMany({where:{role:"APPROVER",active:true},select:{eventId:true,userId:true}});
  const approved=new Set(rows.filter(r=>r.userId===viewerId).map(r=>r.eventId));
  return new Set(rows.filter(r=>!approved.has(r.eventId)).map(r=>r.eventId));
}
export async function financeVisible(viewerId:string,eventId:string){
  const rows=await db.eventRoleAssignment.findMany({where:{eventId,role:"APPROVER",active:true},select:{userId:true}});
  return rows.length===0||rows.some(r=>r.userId===viewerId);
}
