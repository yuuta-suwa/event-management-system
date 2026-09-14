import type {PaymentStatus} from "@prisma/client";
const transitions:Record<PaymentStatus,readonly PaymentStatus[]>={UNPAID:["PENDING","PAID","CANCELLED"],PENDING:["UNPAID","PAID","CANCELLED"],PAID:["REFUNDED"],CANCELLED:["UNPAID"],REFUNDED:[]};
export function canTransitionPayment(from:PaymentStatus,to:PaymentStatus){return from===to||transitions[from].includes(to)}
export function assertPaymentTransition(from:PaymentStatus,to:PaymentStatus){if(!canTransitionPayment(from,to))throw new Error(`INVALID_PAYMENT_TRANSITION:${from}:${to}`)}
