ALTER TABLE "TicketAllocation" ADD COLUMN "referralCode" TEXT;

UPDATE "TicketAllocation"
SET "referralCode" = md5(random()::text || clock_timestamp()::text || "id")
WHERE "referralCode" IS NULL;

ALTER TABLE "TicketAllocation" ALTER COLUMN "referralCode" SET NOT NULL;
CREATE UNIQUE INDEX "TicketAllocation_referralCode_key" ON "TicketAllocation"("referralCode");
