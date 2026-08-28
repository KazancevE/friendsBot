-- CreateEnum
CREATE TYPE "BonusLotCategory" AS ENUM ('gift', 'check');

-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'expire';
ALTER TYPE "CouponStatus" ADD VALUE 'expired';

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN "expiresAt" TIMESTAMP(3);
UPDATE "Coupon" SET "expiresAt" = NOW() + interval '10 days' WHERE "expiresAt" IS NULL;
ALTER TABLE "Coupon" ALTER COLUMN "expiresAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "BonusLot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ledgerId" TEXT,
    "category" "BonusLotCategory" NOT NULL,
    "initial" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warned7d" BOOLEAN NOT NULL DEFAULT false,
    "warned3d" BOOLEAN NOT NULL DEFAULT false,
    "warned1d" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BonusLot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BonusLot_ledgerId_key" ON "BonusLot"("ledgerId");

-- AddForeignKey
ALTER TABLE "BonusLot" ADD CONSTRAINT "BonusLot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BonusLot" ADD CONSTRAINT "BonusLot_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;
