-- CreateEnum
CREATE TYPE "CheckInMethod" AS ENUM ('qr', 'pin');

-- CreateTable
CREATE TABLE "VenueCode" (
    "id" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "venueCodeId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "method" "CheckInMethod" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckInLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VenueCode_token_key" ON "VenueCode"("token");

-- CreateIndex
CREATE INDEX "VenueCode_validFrom_validUntil_revokedAt_idx" ON "VenueCode"("validFrom", "validUntil", "revokedAt");

-- CreateIndex
CREATE INDEX "CheckInLog_userId_createdAt_idx" ON "CheckInLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CheckInLog_visitId_idx" ON "CheckInLog"("visitId");

-- AddForeignKey
ALTER TABLE "VenueCode" ADD CONSTRAINT "VenueCode_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInLog" ADD CONSTRAINT "CheckInLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInLog" ADD CONSTRAINT "CheckInLog_venueCodeId_fkey" FOREIGN KEY ("venueCodeId") REFERENCES "VenueCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInLog" ADD CONSTRAINT "CheckInLog_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
