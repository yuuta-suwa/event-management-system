import {describe,expect,it} from "vitest";
import {consumeRateLimit} from "@/server/rate-limit";
describe("rate limit",()=>{it("上限までは許可し超過を拒否する",()=>{const key=`test-${Math.random()}`;expect(consumeRateLimit(key,2,1000,100).allowed).toBe(true);expect(consumeRateLimit(key,2,1000,100).allowed).toBe(true);expect(consumeRateLimit(key,2,1000,100).allowed).toBe(false)});it("時間窓経過後にリセットする",()=>{const key=`test-${Math.random()}`;consumeRateLimit(key,1,1000,100);expect(consumeRateLimit(key,1,1000,1101).allowed).toBe(true)})});
