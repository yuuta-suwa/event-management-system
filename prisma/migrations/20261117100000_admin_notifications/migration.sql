-- CreateTable
CREATE TABLE "AdminNotificationPref" (
    "userId" TEXT NOT NULL,
    "registrationEmail" BOOLEAN NOT NULL DEFAULT true,
    "registrationLine" BOOLEAN NOT NULL DEFAULT false,
    "lineUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminNotificationPref_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AdminNotificationLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminNotificationLog_dedupeKey_key" ON "AdminNotificationLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "AdminNotificationLog_userId_createdAt_idx" ON "AdminNotificationLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminNotificationLog_eventId_createdAt_idx" ON "AdminNotificationLog"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminNotificationPref" ADD CONSTRAINT "AdminNotificationPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

