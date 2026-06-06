-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'password',
    "googleSub" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("account", "createdAt", "displayName", "id", "passwordHash", "updatedAt")
SELECT "account", "createdAt", "displayName", "id", "passwordHash", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_account_key" ON "User"("account");
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
