export type MailInput={to:string;subject:string;text:string;html:string;attachments?:{filename:string;contentBase64:string}[]};
export type MailResult={ok:true;id:string|null}|{ok:false;error:string;retryable:boolean};
export const emailConfigured=(env:NodeJS.ProcessEnv=process.env)=>Boolean(env.RESEND_API_KEY&&env.EMAIL_FROM);
/** メール送信(Resend REST API)。送信サービスを替える場合はこのファイルだけを差し替える。 */
export async function sendMail(input:MailInput,env:NodeJS.ProcessEnv=process.env,fetchFn:typeof fetch=fetch):Promise<MailResult>{
  if(!emailConfigured(env))return {ok:false,error:"EMAIL_NOT_CONFIGURED",retryable:false};
  try{
    const response=await fetchFn("https://api.resend.com/emails",{method:"POST",signal:AbortSignal.timeout(10_000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:env.EMAIL_FROM,to:[input.to],subject:input.subject,text:input.text,html:input.html,...(env.EMAIL_REPLY_TO?{reply_to:env.EMAIL_REPLY_TO}:{}),...(input.attachments?.length?{attachments:input.attachments.map(a=>({filename:a.filename,content:a.contentBase64}))}:{})})});
    const body=await response.json().catch(()=>({})) as {id?:string;message?:string;name?:string};
    if(response.ok)return {ok:true,id:body.id??null};
    // 4xx(宛先不正・ドメイン未認証など)は再試行しても直らない。429/5xxは再試行する。
    return {ok:false,error:`RESEND_${response.status}${body.message?`: ${body.message}`.slice(0,200):""}`,retryable:response.status===429||response.status>=500};
  }catch(error){return {ok:false,error:`NETWORK: ${error instanceof Error?error.message:"UNKNOWN"}`.slice(0,200),retryable:true}}
}
