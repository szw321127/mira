import { resolveDatabaseUrl } from "./database-url.js";

describe("resolveDatabaseUrl", () => {
  it("keeps an explicit DATABASE_URL", () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: "postgresql://explicit.example/rednote"
      })
    ).toBe("postgresql://explicit.example/rednote");
  });

  it("builds a PostgreSQL URL from Docker-style database variables", () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_TYPE: "postgres",
        DATABASE_HOST: "postgres",
        DATABASE_PORT: "5432",
        DATABASE_NAME: "rednote",
        DATABASE_USER: "rednote",
        DATABASE_PASSWORD: "p@ss word"
      })
    ).toBe("postgresql://rednote:p%40ss%20word@postgres:5432/rednote?schema=public");
  });

  it("returns undefined when no database configuration is present", () => {
    expect(resolveDatabaseUrl({})).toBeUndefined();
  });
});
