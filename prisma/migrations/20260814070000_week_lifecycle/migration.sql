ALTER TABLE "CompetitionWeek" ADD COLUMN "reopenedAt" DATETIME;
ALTER TABLE "CompetitionWeek" ADD COLUMN "reopenedBy" TEXT;
ALTER TABLE "CompetitionWeek" ADD COLUMN "reopenReason" TEXT;
ALTER TABLE "CompetitionWeek" ADD COLUMN "initialScore" INTEGER NOT NULL DEFAULT 100;
CREATE INDEX "CompetitionWeek_classId_startDate_endDate_idx" ON "CompetitionWeek"("classId", "startDate", "endDate");
CREATE TABLE "CompetitionWeekSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "weekId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "data" JSONB NOT NULL,
  "reason" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitionWeekSnapshot_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "CompetitionWeek" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CompetitionWeekSnapshot_weekId_version_key" ON "CompetitionWeekSnapshot"("weekId", "version");
CREATE INDEX "CompetitionWeekSnapshot_weekId_createdAt_idx" ON "CompetitionWeekSnapshot"("weekId", "createdAt");