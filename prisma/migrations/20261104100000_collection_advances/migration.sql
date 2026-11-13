-- CreateEnum
CREATE TYPE "EventRole" AS ENUM ('COLLECTOR', 'APPROVER');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "collectorId" TEXT;

-- CreateTable
CREATE TABLE "EventRoleAssignment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "EventRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "EventRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionReceipt" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "orderId" TEXT,
    "ticketId" TEXT,
    "payerName" TEXT,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "feeAdvanceId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeAdvance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "obligorName" TEXT NOT NULL,
    "obligorParticipantId" TEXT,
    "advancerName" TEXT NOT NULL,
    "orderId" TEXT,
    "ticketId" TEXT,
    "amount" INTEGER NOT NULL,
    "advancedAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "evidenceNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdBy" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeAdvanceRecovery" (
    "id" TEXT NOT NULL,
    "feeAdvanceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "recoveredAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeAdvanceRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseAdvance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "advancerName" TEXT NOT NULL,
    "advancerUserId" TEXT,
    "category" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "evidenceNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "returnReason" TEXT,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseSettlement" (
    "id" TEXT NOT NULL,
    "expenseAdvanceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventRoleAssignment_eventId_role_active_idx" ON "EventRoleAssignment"("eventId", "role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "EventRoleAssignment_eventId_userId_role_key" ON "EventRoleAssignment"("eventId", "userId", "role");

-- CreateIndex
CREATE INDEX "CollectionReceipt_eventId_collectorId_idx" ON "CollectionReceipt"("eventId", "collectorId");

-- CreateIndex
CREATE INDEX "CollectionReceipt_orderId_idx" ON "CollectionReceipt"("orderId");

-- CreateIndex
CREATE INDEX "CollectionReceipt_ticketId_idx" ON "CollectionReceipt"("ticketId");

-- CreateIndex
CREATE INDEX "FeeAdvance_eventId_status_idx" ON "FeeAdvance"("eventId", "status");

-- CreateIndex
CREATE INDEX "FeeAdvanceRecovery_feeAdvanceId_idx" ON "FeeAdvanceRecovery"("feeAdvanceId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseAdvance_expenseId_key" ON "ExpenseAdvance"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseAdvance_eventId_status_idx" ON "ExpenseAdvance"("eventId", "status");

-- CreateIndex
CREATE INDEX "ExpenseSettlement_expenseAdvanceId_idx" ON "ExpenseSettlement"("expenseAdvanceId");

-- CreateIndex
CREATE INDEX "Ticket_collectorId_idx" ON "Ticket"("collectorId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRoleAssignment" ADD CONSTRAINT "EventRoleAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRoleAssignment" ADD CONSTRAINT "EventRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionReceipt" ADD CONSTRAINT "CollectionReceipt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionReceipt" ADD CONSTRAINT "CollectionReceipt_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionReceipt" ADD CONSTRAINT "CollectionReceipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TicketOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionReceipt" ADD CONSTRAINT "CollectionReceipt_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdvance" ADD CONSTRAINT "FeeAdvance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdvanceRecovery" ADD CONSTRAINT "FeeAdvanceRecovery_feeAdvanceId_fkey" FOREIGN KEY ("feeAdvanceId") REFERENCES "FeeAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAdvance" ADD CONSTRAINT "ExpenseAdvance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAdvance" ADD CONSTRAINT "ExpenseAdvance_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "EventExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseSettlement" ADD CONSTRAINT "ExpenseSettlement_expenseAdvanceId_fkey" FOREIGN KEY ("expenseAdvanceId") REFERENCES "ExpenseAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

