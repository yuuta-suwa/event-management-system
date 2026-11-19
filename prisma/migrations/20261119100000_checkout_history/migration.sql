-- CreateTable
CREATE TABLE "Checkout" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "checkedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedOutBy" TEXT NOT NULL,
    "checkoutType" "CheckinType" NOT NULL,
    "reasonCode" TEXT NOT NULL DEFAULT 'LEAVE',
    "reasonNote" TEXT,
    "returnedAt" TIMESTAMP(3),
    "returnedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checkout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Checkout_eventId_checkedOutAt_idx" ON "Checkout"("eventId", "checkedOutAt");

-- CreateIndex
CREATE INDEX "Checkout_ticketId_checkedOutAt_idx" ON "Checkout"("ticketId", "checkedOutAt");

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_checkedOutBy_fkey" FOREIGN KEY ("checkedOutBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 同じチケットで「退出中(returnedAt が空)」の行は常に1件まで(同時に2回読み取られても二重に退出させない)。
-- Prisma のモデルでは表現できない部分一意インデックスなので SQL で直接作る。
CREATE UNIQUE INDEX "Checkout_ticketId_open_key" ON "Checkout"("ticketId") WHERE "returnedAt" IS NULL;
