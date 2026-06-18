CREATE TABLE "admin_store_entries" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_store_entries_pkey" PRIMARY KEY ("key")
);
