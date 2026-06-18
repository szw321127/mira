import { defineConfig } from "prisma/config";
import { loadBackendEnv } from "./src/config/env.js";
import { resolveDatabaseUrl } from "./src/config/database-url.js";

loadBackendEnv();

const databaseUrl = resolveDatabaseUrl();

if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

export default defineConfig({
  datasource: databaseUrl ? { url: databaseUrl } : undefined,
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  }
});
