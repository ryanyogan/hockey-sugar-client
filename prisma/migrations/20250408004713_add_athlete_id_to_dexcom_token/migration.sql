-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DexcomToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "athleteId" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DexcomToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DexcomToken_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DexcomToken" ("accessToken", "createdAt", "expiresAt", "id", "refreshToken", "updatedAt", "userId") SELECT "accessToken", "createdAt", "expiresAt", "id", "refreshToken", "updatedAt", "userId" FROM "DexcomToken";
DROP TABLE "DexcomToken";
ALTER TABLE "new_DexcomToken" RENAME TO "DexcomToken";
CREATE UNIQUE INDEX "DexcomToken_userId_key" ON "DexcomToken"("userId");
CREATE INDEX "DexcomToken_userId_idx" ON "DexcomToken"("userId");
CREATE INDEX "DexcomToken_athleteId_idx" ON "DexcomToken"("athleteId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
