import {db} from "@/server/db";
import {isLocalDemo} from "@/server/authz";
export type PendingFriend={id:string;lineUserId:string;displayName:string|null;status:string;followedAt:Date};
export async function listPendingLineFriends():Promise<PendingFriend[]>{
  if(isLocalDemo())return [];
  return db.lineFriend.findMany({where:{matchStatus:"PENDING"},orderBy:{followedAt:"desc"},take:50,select:{id:true,lineUserId:true,displayName:true,status:true,followedAt:true}});
}
