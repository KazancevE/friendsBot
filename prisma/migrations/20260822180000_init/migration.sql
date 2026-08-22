-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('guest', 'master', 'admin');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('check', 'manual', 'registration', 'birthday', 'weekly_prize', 'redeem', 'coupon_redeem');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('active', 'redeemed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'guest',
    "firstName" TEXT,
    "lastName" TEXT,
    "birthday" DATE,
    "phone" TEXT,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "qrToken" TEXT NOT NULL,
    "broadcastOptOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "actorId" TEXT,
    "comment" TEXT,
    "checkAmount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ContentPage" (
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "mapUrl" TEXT,

    CONSTRAINT "ContentPage_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceRubles" INTEGER,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promo" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "photos" TEXT[],
    "showInFeed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Promo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxScorePerSession" INTEGER NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameWeek" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "GameWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameScore" (
    "weekId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameScore_pkey" PRIMARY KEY ("weekId","userId")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "weekId" TEXT,
    "status" "CouponStatus" NOT NULL DEFAULT 'active',
    "redeemedBy" TEXT,
    "redeemedAt" TIMESTAMP(3),

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyAward" (
    "weekId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "place" INTEGER NOT NULL,

    CONSTRAINT "WeeklyAward_pkey" PRIMARY KEY ("weekId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_qrToken_key" ON "User"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GameWeek_gameId_weekStart_key" ON "GameWeek"("gameId", "weekStart");

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_openedBy_fkey" FOREIGN KEY ("openedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameWeek" ADD CONSTRAINT "GameWeek_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameScore" ADD CONSTRAINT "GameScore_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "GameWeek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameScore" ADD CONSTRAINT "GameScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "GameWeek"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyAward" ADD CONSTRAINT "WeeklyAward_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "GameWeek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyAward" ADD CONSTRAINT "WeeklyAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

