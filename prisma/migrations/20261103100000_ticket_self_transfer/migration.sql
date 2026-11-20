-- 譲渡リンクの取消用世代番号（既存チケットは0）
ALTER TABLE "Ticket" ADD COLUMN "shareVersion" INTEGER NOT NULL DEFAULT 0;

-- 保有者本人・配布による譲渡は管理者操作者を持たない
ALTER TABLE "TicketTransfer" DROP CONSTRAINT "TicketTransfer_transferredBy_fkey";
ALTER TABLE "TicketTransfer" ALTER COLUMN "transferredBy" DROP NOT NULL;
ALTER TABLE "TicketTransfer" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'ADMIN';
ALTER TABLE "TicketTransfer" ADD CONSTRAINT "TicketTransfer_transferredBy_fkey" FOREIGN KEY ("transferredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
