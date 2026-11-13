"use server";
import {db} from "@/server/db";
import {isLocalDemo,requireUser} from "@/server/authz";
import {expectedWebhookEndpoint,setWebhookEndpoint,testWebhook} from "./diagnostics";
export type DiagnosticsState={ok?:boolean;message?:string};
const endpoint=()=>expectedWebhookEndpoint(process.env.NEXT_PUBLIC_APP_URL??"");
const noToken="アクセストークン（LINE_MESSAGING_ACCESS_TOKEN）がVercelの環境変数に設定されていません。";
export async function applyWebhookEndpoint():Promise<DiagnosticsState>{
  const user=await requireUser(["SUPER_ADMIN"]);
  if(isLocalDemo())return {message:"ローカルデモでは実行できません。"};
  if(!process.env.LINE_MESSAGING_ACCESS_TOKEN)return {ok:false,message:noToken};
  const url=endpoint();
  if(!/^https:\/\//.test(url))return {ok:false,message:"アプリのURL（NEXT_PUBLIC_APP_URL）が本番のhttps URLではありません。"};
  try{
    const r=await setWebhookEndpoint(url);
    await db.auditLog.create({data:{actorId:user.id,action:"LINE_WEBHOOK_ENDPOINT_SET",entityType:"LineChannel",entityId:"messaging",after:{endpoint:url,ok:r.ok,status:r.status}}});
    return r.ok?{ok:true,message:`Webhook URLを ${url} に設定しました。続けて「Webhookの利用」がオンか、診断で確認してください。`}:{ok:false,message:`設定に失敗しました（${r.status}）${r.message?`：${r.message}`:""}`};
  }catch{return {ok:false,message:"LINE APIに接続できませんでした。"}}
}
export async function runWebhookTest():Promise<DiagnosticsState>{
  const user=await requireUser(["SUPER_ADMIN"]);
  if(isLocalDemo())return {message:"ローカルデモでは実行できません。"};
  if(!process.env.LINE_MESSAGING_ACCESS_TOKEN)return {ok:false,message:noToken};
  try{
    const r=await testWebhook(endpoint());
    await db.auditLog.create({data:{actorId:user.id,action:"LINE_WEBHOOK_TESTED",entityType:"LineChannel",entityId:"messaging",after:{ok:r.ok,statusCode:r.statusCode,reason:r.reason}}});
    return r.ok?{ok:true,message:`接続テストに成功しました（応答 ${r.statusCode}）。`}:{ok:false,message:`接続テストに失敗しました：${r.reason||r.detail||`HTTP ${r.status}`}${r.statusCode?`（応答 ${r.statusCode}）`:""}`};
  }catch{return {ok:false,message:"LINE APIに接続できませんでした。"}}
}
