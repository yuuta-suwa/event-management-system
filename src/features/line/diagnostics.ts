import {lineAccessToken} from "@/features/notifications/line";
export type Check={key:string;ok:boolean;label:string;detail?:string};
export type DiagnosticsResult={checks:Check[];bot:{displayName:string;basicId:string}|null;webhook:{endpoint:string;active:boolean}|null;quota:{limit:number|null;used:number}|null;expectedEndpoint:string};
type F=typeof fetch;
const API="https://api.line.me";
async function call(path:string,init:RequestInit={},fetchFn:F=fetch,token?:string){
  const response=await fetchFn(`${API}${path}`,{...init,headers:{Authorization:`Bearer ${token??lineAccessToken()}`,"Content-Type":"application/json",...(init.headers??{})}});
  const text=await response.text();
  let body:unknown=null;try{body=text?JSON.parse(text):null}catch{body=text}
  return {ok:response.ok,status:response.status,body:body as Record<string,unknown>|null};
}
export function expectedWebhookEndpoint(appUrl:string){return `${appUrl.replace(/\/$/,"")}/api/line/webhook`}
export function envChecks(env:NodeJS.ProcessEnv):Check[]{
  const appUrl=env.NEXT_PUBLIC_APP_URL??"";
  return [
    {key:"env_secret",ok:Boolean(env.LINE_CHANNEL_SECRET),label:"チャネルシークレット（LINE_CHANNEL_SECRET）が設定されている"},
    {key:"env_token",ok:Boolean(env.LINE_MESSAGING_ACCESS_TOKEN),label:"チャネルアクセストークン（LINE_MESSAGING_ACCESS_TOKEN）が設定されている"},
    {key:"env_basic",ok:Boolean(env.NEXT_PUBLIC_LINE_BASIC_ID),label:"ベーシックID（NEXT_PUBLIC_LINE_BASIC_ID）が設定されている（マイページの友だち追加ボタン用）"},
    {key:"env_app_url",ok:/^https:\/\//.test(appUrl)&&!/localhost|127\.0\.0\.1/.test(appUrl),label:"アプリのURL（NEXT_PUBLIC_APP_URL）が本番のhttps URLになっている",detail:appUrl||"未設定"},
    {key:"env_login",ok:Boolean(env.LINE_LOGIN_CHANNEL_ID&&env.LINE_LOGIN_CHANNEL_SECRET),label:"（任意）LINEログインのチャネルが設定されている"},
  ];
}
export async function runLineDiagnostics(env:NodeJS.ProcessEnv=process.env,fetchFn:F=fetch):Promise<DiagnosticsResult>{
  const checks=envChecks(env);
  const expectedEndpoint=expectedWebhookEndpoint(env.NEXT_PUBLIC_APP_URL??"");
  let bot:DiagnosticsResult["bot"]=null,webhook:DiagnosticsResult["webhook"]=null,quota:DiagnosticsResult["quota"]=null;
  if(!env.LINE_MESSAGING_ACCESS_TOKEN)return {checks,bot,webhook,quota,expectedEndpoint};
  const token=env.LINE_MESSAGING_ACCESS_TOKEN.replace(/[^\x20-\x7E]/g,"");
  try{
    const info=await call("/v2/bot/info",{},fetchFn,token);
    if(info.ok&&info.body){
      bot={displayName:String(info.body.displayName??""),basicId:String(info.body.basicId??"")};
      checks.push({key:"token_valid",ok:true,label:"アクセストークンが有効で、公式アカウントに接続できる",detail:`${bot.displayName}（${bot.basicId}）`});
      const configured=(env.NEXT_PUBLIC_LINE_BASIC_ID??"").replace(/^@/,"");
      if(configured)checks.push({key:"basic_id_match",ok:bot.basicId.replace(/^@/,"")===configured,label:"設定したベーシックIDが公式アカウントと一致している",detail:`公式アカウント ${bot.basicId} / 設定値 @${configured}`});
    }else checks.push({key:"token_valid",ok:false,label:"アクセストークンが有効で、公式アカウントに接続できる",detail:info.status===401?"トークンが無効または期限切れです（LINE Developersで再発行してください）":`LINE APIがエラーを返しました（${info.status}）`});
  }catch{checks.push({key:"token_valid",ok:false,label:"アクセストークンが有効で、公式アカウントに接続できる",detail:"LINE APIに接続できませんでした"})}
  if(bot){
    try{
      const w=await call("/v2/bot/channel/webhook/endpoint",{},fetchFn,token);
      if(w.ok&&w.body){
        webhook={endpoint:String(w.body.endpoint??""),active:w.body.active===true};
        checks.push({key:"webhook_url",ok:webhook.endpoint===expectedEndpoint,label:"WebhookのURLが本システムを指している",detail:webhook.endpoint||"未設定"});
        checks.push({key:"webhook_active",ok:webhook.active,label:"「Webhookの利用」がオンになっている"});
      }else checks.push({key:"webhook_url",ok:false,label:"WebhookのURLが本システムを指している",detail:`取得できませんでした（${w.status}）`});
    }catch{checks.push({key:"webhook_url",ok:false,label:"WebhookのURLが本システムを指している",detail:"取得できませんでした"})}
    try{
      const [q,c]=await Promise.all([call("/v2/bot/message/quota",{},fetchFn,token),call("/v2/bot/message/quota/consumption",{},fetchFn,token)]);
      if(q.ok&&c.ok&&q.body&&c.body){
        const limit=q.body.type==="limited"?Number(q.body.value):null;quota={limit,used:Number(c.body.totalUsage??0)};
        checks.push({key:"quota",ok:limit===null||quota.used<limit,label:"今月のメッセージ送信数が上限に達していない",detail:limit===null?`今月 ${quota.used} 通（上限なし）`:`今月 ${quota.used} / ${limit} 通`});
      }
    }catch{}
  }
  return {checks,bot,webhook,quota,expectedEndpoint};
}
export async function setWebhookEndpoint(endpoint:string,fetchFn:F=fetch){
  const r=await call("/v2/bot/channel/webhook/endpoint",{method:"PUT",body:JSON.stringify({endpoint})},fetchFn);
  return {ok:r.ok,status:r.status,message:r.ok?null:String((r.body as {message?:unknown}|null)?.message??"")};
}
export async function testWebhook(endpoint:string,fetchFn:F=fetch){
  const r=await call("/v2/bot/channel/webhook/test",{method:"POST",body:JSON.stringify({endpoint})},fetchFn);
  const b=r.body??{};
  return {ok:r.ok&&b.success===true,status:r.status,statusCode:typeof b.statusCode==="number"?b.statusCode:null,reason:String(b.reason??""),detail:String(b.detail??"")};
}
