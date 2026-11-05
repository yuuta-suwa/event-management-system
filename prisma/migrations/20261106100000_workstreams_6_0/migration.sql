-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ReportKind" AS ENUM ('COLLECTION', 'PARTICIPANT', 'INTEGRATED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'RETURNED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CheckinType" ADD VALUE 'RECEPTION_CODE';
ALTER TYPE "CheckinType" ADD VALUE 'NAME_SEARCH';

-- AlterEnum
ALTER TYPE "EventRole" ADD VALUE 'REPORTER';

-- AlterTable
ALTER TABLE "Checkin" ADD COLUMN     "verification" TEXT;

-- AlterTable
ALTER TABLE "EventExpense" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "lineFriendCheckedAt" TIMESTAMP(3),
ADD COLUMN     "lineFriendFlag" BOOLEAN,
ADD COLUMN     "lineVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StorePayment" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "receptionCode" TEXT,
ADD COLUMN     "receptionCodeIssuedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "ticketId" TEXT,
    "participantId" TEXT,
    "kind" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "dedupeKey" TEXT,
    "triggeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApproverChangeRequest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "currentApproverId" TEXT,
    "newApproverId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "emergency" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currentConfirmedAt" TIMESTAMP(3),
    "newConfirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApproverChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApproverChangeApproval" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApproverChangeApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReport" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "snapshot" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,

    CONSTRAINT "EventReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportShare" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ReportShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_dedupeKey_key" ON "EmailLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "EmailLog_eventId_createdAt_idx" ON "EmailLog"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_participantId_idx" ON "EmailLog"("participantId");

-- CreateIndex
CREATE INDEX "EmailLog_status_createdAt_idx" ON "EmailLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ApproverChangeRequest_eventId_status_idx" ON "ApproverChangeRequest"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApproverChangeApproval_requestId_userId_key" ON "ApproverChangeApproval"("requestId", "userId");

-- CreateIndex
CREATE INDEX "EventReport_eventId_kind_status_idx" ON "EventReport"("eventId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventReport_eventId_kind_version_key" ON "EventReport"("eventId", "kind", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ReportShare_tokenHash_key" ON "ReportShare"("tokenHash");

-- CreateIndex
CREATE INDEX "ReportShare_reportId_idx" ON "ReportShare"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_eventId_receptionCode_key" ON "Ticket"("eventId", "receptionCode");

-- AddForeignKey
ALTER TABLE "ApproverChangeRequest" ADD CONSTRAINT "ApproverChangeRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApproverChangeApproval" ADD CONSTRAINT "ApproverChangeApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApproverChangeRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReport" ADD CONSTRAINT "EventReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportShare" ADD CONSTRAINT "ReportShare_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "EventReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

