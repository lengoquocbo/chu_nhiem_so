export type RateEntry={count:number;resetAt:number};export interface RateLimitStore{get(key:string):RateEntry|undefined;set(key:string,value:RateEntry):void;delete(key:string):void}
const root=globalThis as unknown as{loginRates?:Map<string,RateEntry>};const memory=root.loginRates??new Map<string,RateEntry>();root.loginRates=memory;
export const memoryRateLimitStore:RateLimitStore={get:k=>memory.get(k),set:(k,v)=>memory.set(k,v),delete:k=>memory.delete(k)};
let store:RateLimitStore=memoryRateLimitStore;export function configureRateLimitStore(next:RateLimitStore){store=next}
export function normalizeLoginIdentifier(value:string){return value.trim().toLowerCase()}
export function loginRateKeys(email:string,ip:string){const normalized=normalizeLoginIdentifier(email);const safeIp=ip.trim()||"unknown";return{email:`login:email:${normalized}`,ip:`login:ip:${safeIp}`}}
export function checkRateLimit(key:string,limit=5,windowMs=600000){const now=Date.now(),current=store.get(key);if(!current||current.resetAt<=now){store.set(key,{count:1,resetAt:now+windowMs});return{allowed:true,remaining:limit-1}}if(current.count>=limit)return{allowed:false,remaining:0,retryAfterMs:current.resetAt-now};current.count++;store.set(key,current);return{allowed:true,remaining:limit-current.count}}
export function resetRateLimit(key:string){store.delete(key)}
export function consumeLoginLimits(email:string,ip:string,emailLimit=5,ipLimit=25){const keys=loginRateKeys(email,ip);const byEmail=checkRateLimit(keys.email,emailLimit);const byIp=checkRateLimit(keys.ip,ipLimit);return{allowed:byEmail.allowed&&byIp.allowed,keys}}
export function resetLoginEmailLimit(email:string){resetRateLimit(loginRateKeys(email,"unused").email)}