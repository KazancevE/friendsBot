-- AlterTable
ALTER TABLE "User" ADD COLUMN "promoConsentAt" TIMESTAMP(3),
ADD COLUMN "promoConsentPolicyVersion" TEXT,
ADD COLUMN "promoConsentGranted" BOOLEAN,
ADD COLUMN "nameConfirmedAt" TIMESTAMP(3),
ADD COLUMN "birthdayPromptedAt" TIMESTAMP(3);

-- Clients who already finished the previous chat registration keep phone, name and birthday.
UPDATE "User"
SET
  "nameConfirmedAt" = COALESCE("nameConfirmedAt", CURRENT_TIMESTAMP),
  "birthdayPromptedAt" = COALESCE("birthdayPromptedAt", CURRENT_TIMESTAMP)
WHERE "personalDataConsentAt" IS NOT NULL
  AND "phone" IS NOT NULL
  AND "firstName" IS NOT NULL;
