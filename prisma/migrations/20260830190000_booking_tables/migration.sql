-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'seated';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'no_show';

-- AlterEnum
ALTER TYPE "StaffActionKind" ADD VALUE IF NOT EXISTS 'booking_table_assign';
ALTER TYPE "StaffActionKind" ADD VALUE IF NOT EXISTS 'booking_table_move';
ALTER TYPE "StaffActionKind" ADD VALUE IF NOT EXISTS 'booking_table_swap';

-- CreateTable
CREATE TABLE "FloorPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 100,
    "height" INTEGER NOT NULL DEFAULT 100,
    "backgroundImageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FloorPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueTable" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "highlights" JSONB NOT NULL DEFAULT '[]',
    "photoUrl" TEXT,
    "seatsMin" INTEGER NOT NULL DEFAULT 1,
    "seatsMax" INTEGER NOT NULL DEFAULT 4,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VenueTable_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "BookingRequest" ADD COLUMN "tableId" TEXT,
ADD COLUMN "endsAt" TIMESTAMP(3),
ADD COLUMN "durationMinutes" INTEGER,
ADD COLUMN "seatedAt" TIMESTAMP(3),
ADD COLUMN "tableAssignedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "BookingRequest_tableId_requestedFor_idx" ON "BookingRequest"("tableId", "requestedFor");

-- AddForeignKey
ALTER TABLE "VenueTable" ADD CONSTRAINT "VenueTable_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "VenueTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
