-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('owner', 'branch_admin', 'master');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "personalDataConsentAt" TIMESTAMP(3),
ADD COLUMN "personalDataPolicyVersion" TEXT,
ADD COLUMN "anonymizedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdminAccount" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'owner',
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminAccount_login_key" ON "AdminAccount"("login");

-- AddForeignKey
ALTER TABLE "AdminAccount" ADD CONSTRAINT "AdminAccount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
