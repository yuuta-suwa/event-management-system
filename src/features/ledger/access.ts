import {db} from "@/server/db";

/** 帳簿を扱える人: ①そのイベントの有効な決裁権者 ②システム管理者(SUPER_ADMIN) ③そのイベントの管理者(担当のEVENT_MANAGER)。
 *  以前は決裁権者だけだったが、管理者が帳簿の作成・閲覧・提出を行えるように広げた。それ以外(受付スタッフ・集金担当・参加者)は不可。 */
export function canViewLedger(userId:string,assignments:{userId:string;role:string;active:boolean}[]){
  return assignments.some(a=>a.active&&a.role==="APPROVER"&&a.userId===userId);
}
export function canManageLedger(input:{role:string;userId:string;managerId:string;assignments:{userId:string;role:string;active:boolean}[]}){
  if(input.role==="SUPER_ADMIN")return true;
  if(input.role==="EVENT_MANAGER"&&input.managerId===input.userId)return true;
  return canViewLedger(input.userId,input.assignments);
}
export type Viewer=string|{id:string;role?:string};
async function resolveViewer(v:Viewer):Promise<{id:string;role:string}>{
  if(typeof v!=="string"&&v.role)return {id:v.id,role:v.role};
  const id=typeof v==="string"?v:v.id;
  const row=await db.user.findUnique({where:{id},select:{role:true}});
  return {id,role:row?.role??"PARTICIPANT"};
}
export async function ledgerAccess(viewer:Viewer,eventId:string){
  const [who,event,assignments]=await Promise.all([resolveViewer(viewer),db.event.findUnique({where:{id:eventId},select:{managerId:true}}),db.eventRoleAssignment.findMany({where:{eventId,role:"APPROVER",active:true},select:{userId:true,role:true,active:true}})]);
  if(!event)return false;
  return canManageLedger({role:who.role,userId:who.id,managerId:event.managerId,assignments});
}
/** サーバー側認可。帳簿画面・API・Server Action・CSV・印刷の入口で必ず呼ぶ。 */
export async function assertLedgerAccess(viewer:Viewer,eventId:string){
  if(!await ledgerAccess(viewer,eventId))throw new Error("FORBIDDEN");
}
/** 閲覧者が帳簿を扱えるイベントを絞り込む条件(Prismaのwhere)。管理者は全イベント。 */
export function ledgerEventScope(user:{id:string;role:string}){
  if(user.role==="SUPER_ADMIN")return {};
  return {OR:[...(user.role==="EVENT_MANAGER"?[{managerId:user.id}]:[]),{roleAssignments:{some:{userId:user.id,role:"APPROVER" as const,active:true}}}]};
}
/** 決裁権者が指定されたイベントの収支(売上・経費・利益)は、決裁権者・システム管理者・そのイベントの管理者以外には表示しない。未指定のイベントは従来どおり。 */
export async function privateEventIdsFor(viewer:Viewer):Promise<Set<string>>{
  const who=await resolveViewer(viewer);
  if(who.role==="SUPER_ADMIN")return new Set();
  const rows=await db.eventRoleAssignment.findMany({where:{role:"APPROVER",active:true},select:{eventId:true,userId:true,event:{select:{managerId:true}}}});
  const allowed=new Set(rows.filter(r=>r.userId===who.id||(who.role==="EVENT_MANAGER"&&r.event.managerId===who.id)).map(r=>r.eventId));
  return new Set(rows.filter(r=>!allowed.has(r.eventId)).map(r=>r.eventId));
}
export async function financeVisible(viewer:Viewer,eventId:string){
  const who=await resolveViewer(viewer);
  if(who.role==="SUPER_ADMIN")return true;
  const [rows,event]=await Promise.all([db.eventRoleAssignment.findMany({where:{eventId,role:"APPROVER",active:true},select:{userId:true}}),db.event.findUnique({where:{id:eventId},select:{managerId:true}})]);
  return rows.length===0||rows.some(r=>r.userId===who.id)||(who.role==="EVENT_MANAGER"&&event?.managerId===who.id);
}
