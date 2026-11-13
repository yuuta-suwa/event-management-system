import type {CheckinResult,UnpaidResolution,Verification} from "./service";
export type CheckinRequest=
  |{method:"QR";token:string;eventId?:string;resolution?:UnpaidResolution}
  |{method:"RECEPTION_CODE";eventId:string;code:string;resolution?:UnpaidResolution}
  |{method:"NAME_SEARCH";eventId:string;ticketId:string;verification:Verification;phoneLast4?:string;resolution?:UnpaidResolution};
export async function postCheckin(body:CheckinRequest):Promise<{result:CheckinResult;ms:number}>{
  const t0=performance.now();
  try{
    const response=await fetch("/api/checkins",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
    const json=await response.json().catch(()=>null);
    const result:CheckinResult=json&&typeof json.kind==="string"?json:{kind:"INVALID",message:json?.message??"受付に失敗しました"};
    return {result,ms:performance.now()-t0};
  }catch{
    return {result:{kind:"INVALID",message:"通信できませんでした。電波状況を確認して再試行してください"},ms:performance.now()-t0};
  }
}
export function percentile(values:number[],p:number){
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(p/100*sorted.length)-1))];
}
// 成功時の音・振動フィードバック(失敗しても受付結果には影響しない)
export function feedback(kind:CheckinResult["kind"]){
  try{
    if(typeof navigator!=="undefined"&&"vibrate" in navigator)navigator.vibrate(kind==="OK"?60:[120,60,120]);
    const Ctx=window.AudioContext??(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!Ctx)return;
    const ctx=new Ctx();const osc=ctx.createOscillator();const gain=ctx.createGain();
    osc.frequency.value=kind==="OK"?880:220;gain.gain.value=0.08;osc.connect(gain);gain.connect(ctx.destination);
    osc.start();osc.stop(ctx.currentTime+(kind==="OK"?0.12:0.3));osc.onended=()=>void ctx.close();
  }catch{/* 音が出せない端末では無視 */}
}
