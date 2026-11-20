-- AlterTable
ALTER TABLE "ExpenseSettlement" ADD COLUMN     "custodyCollectorId" TEXT;

-- CreateTable
CREATE TABLE "Remittance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "plannedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "receivedAmount" INTEGER,
    "evidenceNote" TEXT,
    "note" TEXT,
    "discrepancyNote" TEXT,
    "cancelReason" TEXT,
    "senderConfirmedAt" TIMESTAMP(3),
    "recipientConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Remittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorePayment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "description" TEXT,
    "plannedAmount" INTEGER NOT NULL,
    "plannedDate" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorePaymentRecord" (
    "id" TEXT NOT NULL,
    "storePaymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "evidenceNote" TEXT,
    "receiptNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorePaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Remittance_eventId_status_idx" ON "Remittance"("eventId", "status");

-- CreateIndex
CREATE INDEX "Remittance_senderId_idx" ON "Remittance"("senderId");

-- CreateIndex
CREATE INDEX "Remittance_recipientId_idx" ON "Remittance"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "StorePayment_expenseId_key" ON "StorePayment"("expenseId");

-- CreateIndex
CREATE INDEX "StorePayment_eventId_idx" ON "StorePayment"("eventId");

-- CreateIndex
CREATE INDEX "StorePaymentRecord_storePaymentId_idx" ON "StorePaymentRecord"("storePaymentId");

-- AddForeignKey
ALTER TABLE "ExpenseSettlement" ADD CONSTRAINT "ExpenseSettlement_custodyCollectorId_fkey" FOREIGN KEY ("custodyCollectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorePayment" ADD CONSTRAINT "StorePayment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorePayment" ADD CONSTRAINT "StorePayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "EventExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorePaymentRecord" ADD CONSTRAINT "StorePaymentRecord_storePaymentId_fkey" FOREIGN KEY ("storePaymentId") REFERENCES "StorePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

