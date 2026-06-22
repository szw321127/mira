import { spawnSync } from "node:child_process";
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
});
