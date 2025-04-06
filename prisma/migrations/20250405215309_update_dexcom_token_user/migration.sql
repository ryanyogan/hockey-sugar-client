/*
  Warnings:

  - You are about to drop the column `athleteId` on the `DexcomToken` table. All the data in the column will be lost.
  - Added the required column `userId` to the `DexcomToken` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DexcomToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DexcomToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DexcomToken" ("accessToken", "createdAt", "expiresAt", "id", "refreshToken", "updatedAt") SELECT "accessToken", "createdAt", "expiresAt", "id", "refreshToken", "updatedAt" FROM "DexcomToken";
DROP TABLE "DexcomToken";
ALTER TABLE "new_DexcomToken" RENAME TO "DexcomToken";
CREATE UNIQUE INDEX "DexcomToken_userId_key" ON "DexcomToken"("userId");
CREATE INDEX "DexcomToken_userId_idx" ON "DexcomToken"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
