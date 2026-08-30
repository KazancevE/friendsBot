-- AlterEnum
ALTER TYPE "StaffActionKind" ADD VALUE 'guest_message';

-- AlterTable
ALTER TABLE "Promo" ADD COLUMN "broadcastSegment" TEXT,
ADD COLUMN "broadcastRecipients" INTEGER,
ADD COLUMN "broadcastSent" INTEGER,
ADD COLUMN "broadcastFailed" INTEGER;
