import { PrismaService } from "./prisma.service.js";

describe("PrismaService", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws a clear configuration error when database settings are missing", () => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: "",
      DATABASE_TYPE: "",
      DATABASE_HOST: "",
      DATABASE_NAME: "",
      DATABASE_USER: "",
      DATABASE_PASSWORD: ""
    };

    expect(() => new PrismaService()).toThrow(
      "DATABASE_URL or PostgreSQL database variables are required."
    );
  });
});
