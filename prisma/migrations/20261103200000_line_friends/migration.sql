-- CreateTable
CREATE TABLE "LineFriend" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'FOLLOWING',
    "matchStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "participantId" TEXT,
    "followedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unfollowedAt" TIMESTAMP(3),
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineFriend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineWebhookEvent" (
    "id" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineFriend_lineUserId_key" ON "LineFriend"("lineUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LineFriend_participantId_key" ON "LineFriend"("participantId");

-- CreateIndex
CREATE INDEX "LineFriend_matchStatus_status_idx" ON "LineFriend"("matchStatus", "status");

-- AddForeignKey
ALTER TABLE "LineFriend" ADD CONSTRAINT "LineFriend_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 既存のLINE連携済み参加者を友だち管理テーブルへ引き継ぐ（連携状態は変更しない）
INSERT INTO "LineFriend" ("id","lineUserId","status","matchStatus","participantId","followedAt","matchedAt","createdAt","updatedAt")
SELECT 'lf_' || "id", "lineUserId", 'FOLLOWING', 'MATCHED', "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Participant" WHERE "lineUserId" IS NOT NULL
ON CONFLICT ("lineUserId") DO NOTHING;
