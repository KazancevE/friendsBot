-- CreateEnum
CREATE TYPE "PromoRuleKind" AS ENUM ('double_check_bonus', 'min_check_bonus', 'weekday_multiplier', 'promo_code');

-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'referral';
ALTER TYPE "LedgerType" ADD VALUE 'promo_bonus';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN "referredByUserId" TEXT;
ALTER TABLE "User" ADD COLUMN "birthdayWarnedYear" INTEGER;
ALTER TABLE "User" ADD COLUMN "birthdayGreetedYear" INTEGER;

-- CreateTable
CREATE TABLE "ReferralActivation" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL,
    "visitId" TEXT,
    "ledgerIdReferrer" TEXT,
    "ledgerIdReferee" TEXT,

    CONSTRAINT "ReferralActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoRule" (
    "id" TEXT NOT NULL,
    "promoId" TEXT,
    "kind" "PromoRuleKind" NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PromoRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE UNIQUE INDEX "ReferralActivation_refereeId_key" ON "ReferralActivation"("refereeId");
CREATE INDEX "PromoRule_active_validFrom_validUntil_idx" ON "PromoRule"("active", "validFrom", "validUntil");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralActivation" ADD CONSTRAINT "ReferralActivation_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralActivation" ADD CONSTRAINT "ReferralActivation_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRule" ADD CONSTRAINT "PromoRule_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "Promo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
