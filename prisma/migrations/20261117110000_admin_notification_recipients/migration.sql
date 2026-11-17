-- CreateTable
CREATE TABLE "AdminNotificationRecipient" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminNotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminNotificationRecipient_participantId_key" ON "AdminNotificationRecipient"("participantId");

-- AddForeignKey
ALTER TABLE "AdminNotificationRecipient" ADD CONSTRAINT "AdminNotificationRecipient_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

