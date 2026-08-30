-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "imageUrl" TEXT;

-- CreateTable
CREATE TABLE "StaffWeeklySchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,

    CONSTRAINT "StaffWeeklySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffWeeklySchedule_userId_weekday_key" ON "StaffWeeklySchedule"("userId", "weekday");

-- AddForeignKey
ALTER TABLE "StaffWeeklySchedule" ADD CONSTRAINT "StaffWeeklySchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
