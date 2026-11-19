// 一時的なDBエラー(接続待ち・トランザクション時間切れ・直列化の競合など)は、もう一度やれば通ることが多い。
const TRANSIENT=new Set(["P2028","P2034","P2024","P1001","P1002","P1008","P1017"]);
export const isTransientDbError=(e:unknown)=>typeof e==="object"&&e!==null&&"code" in e&&TRANSIENT.has(String((e as {code:unknown}).code));
/** 一時的なDBエラーのときだけ、短い間隔で再実行する。それ以外のエラーはそのまま投げる。 */
export async function retryTransient<T>(run:()=>Promise<T>,attempts=3,delayMs=250):Promise<T>{
  let last:unknown;
  for(let i=0;i<attempts;i++){
    try{return await run()}
    catch(e){last=e;if(!isTransientDbError(e)||i===attempts-1)throw e;await new Promise(r=>setTimeout(r,delayMs*(i+1)))}
  }
  throw last;
}
