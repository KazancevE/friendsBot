-- WeeklyAward: per tournament week (all games), not per game week

ALTER TABLE "WeeklyAward" ADD COLUMN "weekStart" TIMESTAMP(3);

UPDATE "WeeklyAward" wa
SET "weekStart" = gw."weekStart"
FROM "GameWeek" gw
WHERE wa."weekId" = gw."id";

ALTER TABLE "WeeklyAward" DROP CONSTRAINT "WeeklyAward_weekId_fkey";
ALTER TABLE "WeeklyAward" DROP CONSTRAINT "WeeklyAward_pkey";
ALTER TABLE "WeeklyAward" DROP COLUMN "weekId";
ALTER TABLE "WeeklyAward" ALTER COLUMN "weekStart" SET NOT NULL;
ALTER TABLE "WeeklyAward" ADD CONSTRAINT "WeeklyAward_pkey" PRIMARY KEY ("weekStart", "userId");
