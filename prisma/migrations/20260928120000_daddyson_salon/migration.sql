-- AlterTable
ALTER TABLE "User" ADD COLUMN "maxUserId" BIGINT;
ALTER TABLE "User" ADD COLUMN "lastHaircutNudgeAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_maxUserId_key" ON "User"("maxUserId");

-- CreateEnum
CREATE TYPE "BarberLevel" AS ENUM ('junior', 'barber', 'senior', 'chef');
CREATE TYPE "AppointmentStatus" AS ENUM ('confirmed', 'cancelled', 'completed');
CREATE TYPE "SalonChannel" AS ENUM ('telegram', 'max');

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Бийск',
    "openMin" INTEGER NOT NULL DEFAULT 600,
    "closeMin" INTEGER NOT NULL DEFAULT 1260,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServicePrice" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "level" "BarberLevel" NOT NULL,
    "priceRub" INTEGER NOT NULL,
    "priceFrom" BOOLEAN NOT NULL DEFAULT false,
    "durationMinutes" INTEGER NOT NULL,
    "anyLevel" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ServicePrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Barber" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "BarberLevel" NOT NULL,
    "branchId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Barber_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BarberSchedule" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,

    CONSTRAINT "BarberSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'confirmed',
    "priceRub" INTEGER NOT NULL,
    "reminder24SentAt" TIMESTAMP(3),
    "reminder2SentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalonDialog" (
    "id" TEXT NOT NULL,
    "channel" "SalonChannel" NOT NULL,
    "externalId" TEXT NOT NULL,
    "userId" TEXT,
    "flow" TEXT NOT NULL DEFAULT 'menu',
    "step" TEXT NOT NULL DEFAULT 'idle',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonDialog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminNotice" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "branchId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminNotice_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN "branchId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Branch_slug_key" ON "Branch"("slug");
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");
CREATE UNIQUE INDEX "ServicePrice_serviceId_branchId_level_key" ON "ServicePrice"("serviceId", "branchId", "level");
CREATE UNIQUE INDEX "BarberSchedule_barberId_weekday_key" ON "BarberSchedule"("barberId", "weekday");
CREATE INDEX "Appointment_barberId_startsAt_idx" ON "Appointment"("barberId", "startsAt");
CREATE INDEX "Appointment_userId_status_idx" ON "Appointment"("userId", "status");
CREATE INDEX "Appointment_branchId_startsAt_idx" ON "Appointment"("branchId", "startsAt");
CREATE UNIQUE INDEX "SalonDialog_channel_externalId_key" ON "SalonDialog"("channel", "externalId");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServicePrice" ADD CONSTRAINT "ServicePrice_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServicePrice" ADD CONSTRAINT "ServicePrice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Barber" ADD CONSTRAINT "Barber_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BarberSchedule" ADD CONSTRAINT "BarberSchedule_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
