import type {TicketStatus} from "@prisma/client";
export function canTransferTicket(input:{status:TicketStatus;hasCheckin:boolean}){return !input.hasCheckin&&input.status!=="USED"&&input.status!=="CANCELLED"&&input.status!=="EXPIRED"}
export function nextQrVersion(current:number){if(!Number.isInteger(current)||current<1)throw new Error("INVALID_QR_VERSION");return current+1}
export function canShareTicket(input:{status:TicketStatus;hasCheckin:boolean;eventPublished:boolean}){return input.eventPublished&&canTransferTicket({status:input.status,hasCheckin:input.hasCheckin})&&input.status!=="TRANSFERRED"}
