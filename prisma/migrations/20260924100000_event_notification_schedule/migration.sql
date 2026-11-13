-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_DAY_OF';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "eveNotificationEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Event" ADD COLUMN "eveNotificationTime" TEXT NOT NULL DEFAULT '18:00';
ALTER TABLE "Event" ADD COLUMN "dayOfNotificationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "dayOfNotificationTime" TEXT NOT NULL DEFAULT '12:00';
ALTER TABLE "Event" ADD COLUMN "beforeStartNotificationEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Event" ADD COLUMN "beforeStartNotificationMinutes" INTEGER NOT NULL DEFAULT 180;
ALTER TABLE "Event" ADD COLUMN "unpaidReminderEnabled" BOOLEAN NOT NULL DEFAULT true;
