/*
  Warnings:

  - You are about to drop the `Status` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `statusId` on the `GlucoseReading` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Status_userId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Status";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GlucoseReading" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "value" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'mg/dL',
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "statusType" TEXT NOT NULL DEFAULT 'OK',
    "acknowledgedAt" DATETIME,
    "source" TEXT DEFAULT 'manual',
    CONSTRAINT "GlucoseReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GlucoseReading_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GlucoseReading" ("createdAt", "id", "recordedAt", "recordedById", "source", "unit", "updatedAt", "userId", "value") SELECT "createdAt", "id", "recordedAt", "recordedById", "source", "unit", "updatedAt", "userId", "value" FROM "GlucoseReading";
DROP TABLE "GlucoseReading";
ALTER TABLE "new_GlucoseReading" RENAME TO "GlucoseReading";
CREATE INDEX "GlucoseReading_userId_idx" ON "GlucoseReading"("userId");
CREATE INDEX "GlucoseReading_recordedById_idx" ON "GlucoseReading"("recordedById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
