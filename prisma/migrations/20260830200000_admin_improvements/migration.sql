-- AlterEnum
ALTER TYPE "StaffActionKind" ADD VALUE 'visit_close';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "telegramUsername" TEXT;

-- CreateEnum
CREATE TYPE "FloorElementKind" AS ENUM ('bar', 'obstacle', 'wall', 'decor');

-- CreateTable
CREATE TABLE "FloorElement" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "kind" "FloorElementKind" NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FloorElement_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "QuizQuestion" ADD COLUMN "imageUrl" TEXT;

-- CreateIndex
CREATE INDEX "User_telegramUsername_idx" ON "User"("telegramUsername");

-- AddForeignKey
ALTER TABLE "FloorElement" ADD CONSTRAINT "FloorElement_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
