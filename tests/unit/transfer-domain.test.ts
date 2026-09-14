import {describe,expect,it} from "vitest";
import {canTransferTicket,nextQrVersion} from "@/features/transfers/domain";
describe("ticket transfer domain",()=>{it("有効な未受付チケットを譲渡できる",()=>expect(canTransferTicket({status:"ACTIVE",hasCheckin:false})).toBe(true));it("受付済チケットを譲渡できない",()=>expect(canTransferTicket({status:"USED",hasCheckin:true})).toBe(false));it("キャンセル済チケットを譲渡できない",()=>expect(canTransferTicket({status:"CANCELLED",hasCheckin:false})).toBe(false));it("譲渡ごとにQR世代を増やす",()=>expect(nextQrVersion(1)).toBe(2))});
