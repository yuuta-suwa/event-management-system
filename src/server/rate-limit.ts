type Bucket={count:number;resetAt:number};
const state=globalThis as unknown as{eventRateLimits?:Map<string,Bucket>};
state.eventRateLimits??=new Map();
export function consumeRateLimit(key:string,limit:number,windowMs:number,now=Date.now()){const current=state.eventRateLimits!.get(key);if(!current||current.resetAt<=now){state.eventRateLimits!.set(key,{count:1,resetAt:now+windowMs});return {allowed:true,remaining:limit-1,retryAfterSeconds:0}}if(current.count>=limit)return {allowed:false,remaining:0,retryAfterSeconds:Math.max(1,Math.ceil((current.resetAt-now)/1000))};current.count++;return {allowed:true,remaining:limit-current.count,retryAfterSeconds:0}}
export function clientAddress(headers:Headers){return (headers.get("x-forwarded-for")?.split(",")[0]??headers.get("x-real-ip")??"unknown").trim()}
