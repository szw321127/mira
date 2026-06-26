import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("prisma.config", () => {
  it("provides datasource.url for Prisma migrate commands", () => {
    const prismaCli = resolve("node_modules/prisma/build/index.js");
    const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_TYPE: "postgres",
        DATABASE_HOST: "127.0.0.1",
        DATABASE_PORT: "1",
        DATABASE_NAME: "rednote",
        DATABASE_USER: "rednote",
        DATABASE_PASSWORD: "p@ss word",
        DATABASE_URL: "",
      },
      encoding: "utf8",
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain('Datasource "db": PostgreSQL database "rednote"');
    expect(output).toContain('at "127.0.0.1:1"');
    expect(output).not.toContain("datasource.url property is required");
  });

  it("defines public user auth and conversation persistence models", () => {
    const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");
    const migration = readFileSync(
      resolve(
        "prisma/migrations/20260622000100_add_user_auth_and_conversations/migration.sql",
      ),
      "utf8",
    );
    const attachmentMigration = readFileSync(
      resolve(
        "prisma/migrations/20260625000100_add_message_attachments/migration.sql",
      ),
      "utf8",
    );
    const failedEmailCodeMigration = readFileSync(
      resolve(
        "prisma/migrations/20260626000100_add_email_code_failed_at/migration.sql",
      ),
      "utf8",
    );
    const generatedImagesMigration = readFileSync(
      resolve(
        "prisma/migrations/20260626000200_add_message_generated_images/migration.sql",
      ),
      "utf8",
    );

    expect(schema).toContain("enum UserStatus");
    expect(schema).toContain("enum MessageRole");
    expect(schema).toContain("enum MessageStatus");
    expect(schema).toContain("model User");
    expect(schema).toContain("model EmailVerificationCode");
    expect(schema).toMatch(/failedAt\s+DateTime\?/);
    expect(schema).toContain("model UserSession");
    expect(schema).toContain("model Conversation");
    expect(schema).toContain("model Message");
    expect(schema).toMatch(/attachments\s+Json/);
    expect(schema).toMatch(/generatedImages\s+Json/);
    expect(schema).toContain("  expand");

    expect(migration).toContain('CREATE TABLE "users"');
    expect(migration).toContain('CREATE TABLE "email_verification_codes"');
    expect(migration).toContain('CREATE TABLE "user_sessions"');
    expect(migration).toContain('CREATE TABLE "conversations"');
    expect(migration).toContain('CREATE TABLE "messages"');
    expect(attachmentMigration).toContain('ALTER TABLE "messages" ADD COLUMN "attachments"');
    expect(generatedImagesMigration).toContain(
      'ALTER TABLE "messages" ADD COLUMN "generatedImages"',
    );
    expect(failedEmailCodeMigration).toContain(
      'ALTER TABLE "email_verification_codes" ADD COLUMN "failedAt"',
    );
  });
});
