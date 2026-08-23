-- AlterTable
ALTER TABLE "Guardian" ADD COLUMN "archivedAt" DATETIME;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "deletedAt" DATETIME;

-- CreateTable
CREATE TABLE "TeamTransferHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "previousTeamId" TEXT,
    "newTeamId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamTransferHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeamTransferHistory_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeamTransferHistory_previousTeamId_fkey" FOREIGN KEY ("previousTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TeamTransferHistory_newTeamId_fkey" FOREIGN KEY ("newTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClassOfficerAppointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "userId" TEXT,
    "classId" TEXT NOT NULL,
    "teamId" TEXT,
    "role" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "appointedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassOfficerAppointment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClassOfficerAppointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClassOfficerAppointment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClassOfficerAppointment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TeamTransferHistory_studentId_changedAt_idx" ON "TeamTransferHistory"("studentId", "changedAt");

-- CreateIndex
CREATE INDEX "TeamTransferHistory_classId_idx" ON "TeamTransferHistory"("classId");

-- CreateIndex
CREATE INDEX "ClassOfficerAppointment_classId_role_active_idx" ON "ClassOfficerAppointment"("classId", "role", "active");

-- CreateIndex
CREATE INDEX "ClassOfficerAppointment_studentId_idx" ON "ClassOfficerAppointment"("studentId");
