import { defineConfig } from "prisma/config";
import { loadBackendEnv } from "./src/config/env.js";
import { resolveDatabaseUrl } from "./src/config/database-url.js";

loadBackendEnv();

const databaseUrl = resolveDatabaseUrl();

if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  }
});
