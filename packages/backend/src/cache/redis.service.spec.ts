import { jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { RedisService } from "./redis.service.js";

class FakeRedisClient {
  private readonly values = new Map<string, string>();

  readonly get = jest.fn((key: string) =>
    Promise.resolve(this.values.get(key) ?? null)
  );
  readonly set = jest.fn(
    (key: string, value: string, mode: "EX", ttlSeconds: number) => {
      this.values.set(key, value);
      return Promise.resolve(`${mode}:${ttlSeconds}`);
    }
  );
  readonly del = jest.fn((key: string) => {
    const existed = this.values.delete(key);
    return Promise.resolve(existed ? 1 : 0);
  });
  readonly ping = jest.fn(() => Promise.resolve("PONG"));
  readonly quit = jest.fn(() => Promise.resolve("OK"));
}

describe("RedisService", () => {
  it("can be constructed by Nest without custom providers", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RedisService]
    }).compile();

    const service = moduleRef.get(RedisService);

    await expect(service.checkHealth()).resolves.toBe("disabled");
    await moduleRef.close();
  });

  it("stores JSON values with a TTL", async () => {
    const client = new FakeRedisClient();
    const service = new RedisService(() => client, "redis://redis:6379");

    await service.setJson("session:1", { userId: "user-1" }, 300);

    await expect(service.getJson("session:1")).resolves.toEqual({
      userId: "user-1"
    });
    expect(client.set).toHaveBeenCalledWith(
      "session:1",
      JSON.stringify({ userId: "user-1" }),
      "EX",
      300
    );
  });

  it("reports disabled health when REDIS_URL is not configured", async () => {
    const service = new RedisService(() => new FakeRedisClient(), undefined);

    await expect(service.checkHealth()).resolves.toBe("disabled");
  });
});
