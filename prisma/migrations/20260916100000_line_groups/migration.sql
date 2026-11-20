CREATE TABLE "LineGroup" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "LineGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LineGroup_groupId_key" ON "LineGroup"("groupId");
