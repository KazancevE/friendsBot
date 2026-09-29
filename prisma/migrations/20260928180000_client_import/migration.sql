ALTER TABLE "User" ADD COLUMN "importedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "importWelcomeGrantedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "preferredBarberName" TEXT;
ALTER TABLE "User" ADD COLUMN "importedVisitCount" INTEGER;
ALTER TABLE "User" ADD COLUMN "importedSpentRub" INTEGER;

ALTER TABLE "Visit" ADD COLUMN "importKey" TEXT;
CREATE UNIQUE INDEX "Visit_importKey_key" ON "Visit"("importKey");

ALTER TABLE "Appointment" ADD COLUMN "importKey" TEXT;
CREATE UNIQUE INDEX "Appointment_importKey_key" ON "Appointment"("importKey");
