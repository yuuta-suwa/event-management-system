-- CreateTable
CREATE TABLE "LedgerRevision" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "editedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerRevision_eventId_createdAt_idx" ON "LedgerRevision"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerRevision_entityType_entityId_createdAt_idx" ON "LedgerRevision"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "LedgerRevision" ADD CONSTRAINT "LedgerRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerRevision" ADD CONSTRAINT "LedgerRevision_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
