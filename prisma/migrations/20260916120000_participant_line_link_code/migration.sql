ALTER TABLE "Participant" ADD COLUMN "lineLinkCode" TEXT;

UPDATE "Participant"
SET "lineLinkCode" = upper(substr(md5(random()::text || clock_timestamp()::text || "id"), 1, 8))
WHERE "lineLinkCode" IS NULL;

ALTER TABLE "Participant" ALTER COLUMN "lineLinkCode" SET NOT NULL;
CREATE UNIQUE INDEX "Participant_lineLinkCode_key" ON "Participant"("lineLinkCode");
