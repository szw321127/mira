CREATE TABLE "AdminModelApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "AdminModelApiKey" (
    "id",
    "type",
    "name",
    "apiKeyEncrypted",
    "enabled",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy_' || "type",
    "type",
    '默认 Key',
    "apiKeyEncrypted",
    true,
    "createdAt",
    "updatedAt"
FROM "AdminModelConfig"
WHERE "apiKeyEncrypted" IS NOT NULL AND length(trim("apiKeyEncrypted")) > 0;

CREATE INDEX "AdminModelApiKey_type_enabled_createdAt_idx" ON "AdminModelApiKey"("type", "enabled", "createdAt");
