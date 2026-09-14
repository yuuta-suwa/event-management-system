import {describe,expect,it} from "vitest";
import {registrationSchema} from "@/features/participants/schema";
const valid={eventId:"e1",referralCode:"ref",name:"山田太郎",nameKana:"ヤマダタロウ",phone:"090-1234-5678",email:"taro@example.com",gender:"",age:"35",occupation:"会社員",notes:"",privacy:"on"};
describe("registration schema",()=>{it("必須情報を受理する",()=>expect(registrationSchema.safeParse(valid).success).toBe(true));it("不正なメールを拒否する",()=>expect(registrationSchema.safeParse({...valid,email:"invalid"}).success).toBe(false));it("同意なしを拒否する",()=>expect(registrationSchema.safeParse({...valid,privacy:undefined}).success).toBe(false));it("不正な電話番号を拒否する",()=>expect(registrationSchema.safeParse({...valid,phone:"abc"}).success).toBe(false))});
