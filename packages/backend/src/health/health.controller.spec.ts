import { jest } from "@jest/globals";
import { HealthController } from "./health.controller.js";

describe("HealthController", () => {
  it("reports database and Redis health", async () => {
    const prisma = {
      $queryRaw: jest.fn(() => Promise.resolve([{ ok: 1 }]))
    };
    const redis = {
      checkHealth: jest.fn(() => Promise.resolve("ok" as const))
    };
    const controller = new HealthController(prisma as never, redis as never);

    await expect(controller.check()).resolves.toEqual({
      status: "ok",
      services: {
        database: "ok",
        redis: "ok"
      }
    });
  });

  it("marks the backend degraded when a dependency is unavailable", async () => {
    const prisma = {
      $queryRaw: jest.fn(() => Promise.reject(new Error("database unavailable")))
    };
    const redis = {
      checkHealth: jest.fn(() => Promise.resolve("disabled" as const))
    };
    const controller = new HealthController(prisma as never, redis as never);

    await expect(controller.check()).resolves.toEqual({
      status: "degraded",
      services: {
        database: "unavailable",
        redis: "disabled"
      }
    });
  });
});
