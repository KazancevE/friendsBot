-- AlterTable
ALTER TABLE "User" ADD COLUMN "staffNote" TEXT;

-- CreateEnum
CREATE TYPE "StaffActionKind" AS ENUM ('check', 'redeem', 'manual_adjust', 'visit_open', 'visit_extend', 'coupon_redeem', 'guest_search');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');

-- CreateTable
CREATE TABLE "StaffActionLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "guestId" TEXT,
    "action" "StaffActionKind" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedFor" TIMESTAMP(3) NOT NULL,
    "partySize" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',
    "handledBy" TEXT,
    "handledAt" TIMESTAMP(3),
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StaffActionLog" ADD CONSTRAINT "StaffActionLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffActionLog" ADD CONSTRAINT "StaffActionLog_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_handledBy_fkey" FOREIGN KEY ("handledBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "StaffActionLog_createdAt_idx" ON "StaffActionLog"("createdAt");

-- CreateIndex
CREATE INDEX "StaffActionLog_actorId_idx" ON "StaffActionLog"("actorId");

-- CreateIndex
CREATE INDEX "BookingRequest_status_requestedFor_idx" ON "BookingRequest"("status", "requestedFor");
