import { jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { RedisService } from "./redis.service.js";

class FakeRedisClient {
  private readonly values = new Map<string, string>();
  private readonly lists = new Map<string, string[]>();
  private messageListener: ((channel: string, message: string) => void) | null =
    null;

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
  readonly lpush = jest.fn((key: string, value: string) => {
    const list = this.lists.get(key) ?? [];
    list.unshift(value);
    this.lists.set(key, list);
    return Promise.resolve(list.length);
  });
  readonly rpop = jest.fn((key: string) => {
    const list = this.lists.get(key) ?? [];
    const value = list.pop() ?? null;
    this.lists.set(key, list);
    return Promise.resolve(value);
  });
  readonly lrem = jest.fn((key: string, count: number, value: string) => {
    const list = this.lists.get(key) ?? [];
    const filtered = list.filter((item) => item !== value);
    this.lists.set(key, filtered);
    return Promise.resolve(list.length - filtered.length);
  });
  readonly eval = jest.fn(
    (
      _script: string,
      _numKeys: number,
      key: string,
      field: string,
      value: string
    ) => {
      const list = this.lists.get(key) ?? [];
      const filtered = list.filter((item) => {
        try {
          return JSON.parse(item)?.[field] !== value;
        } catch {
          return true;
        }
      });
      this.lists.set(key, filtered);
      return Promise.resolve(list.length - filtered.length);
    }
  );
  readonly expire = jest.fn(() => Promise.resolve(1));
  readonly publish = jest.fn(() => Promise.resolve(0));
  readonly subscribe = jest.fn(() => Promise.resolve(1));
  readonly unsubscribe = jest.fn(() => Promise.resolve(1));
  readonly on = jest.fn(
    (event: "message", listener: (channel: string, message: string) => void) => {
      if (event === "message") this.messageListener = listener;
      return this;
    }
  );
  readonly off = jest.fn(
    (event: "message", listener: (channel: string, message: string) => void) => {
      if (event === "message" && this.messageListener === listener) {
        this.messageListener = null;
      }
      return this;
    }
  );
  readonly ping = jest.fn(() => Promise.resolve("PONG"));
  readonly quit = jest.fn(() => Promise.resolve("OK"));

  emitMessage(channel: string, message: string) {
    this.messageListener?.(channel, message);
  }
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

  it("pushes pops and removes JSON list values", async () => {
    const client = new FakeRedisClient();
    const service = new RedisService(() => client, "redis://redis:6379");
    const payload = { taskId: "task-1" };

    await service.pushListJson("queue", payload, 300);
    await service.pushListJson("queue", { taskId: "task-2" }, 300);
    await service.removeListJson("queue", { taskId: "task-2" });

    await expect(service.popListJson("queue")).resolves.toEqual(payload);
    await expect(service.popListJson("queue")).resolves.toBeNull();
    expect(client.lpush).toHaveBeenCalledWith("queue", JSON.stringify(payload));
    expect(client.expire).toHaveBeenCalledWith("queue", 300);
    expect(client.lrem).toHaveBeenCalledWith(
      "queue",
      0,
      JSON.stringify({ taskId: "task-2" })
    );
  });

  it("removes JSON list values by object field", async () => {
    const client = new FakeRedisClient();
    const service = new RedisService(() => client, "redis://redis:6379");

    await service.pushListJson("queue", { taskId: "task-1" }, 300);
    await service.pushListJson("queue", { taskId: "task-2" }, 300);
    await service.removeListJsonByField("queue", "taskId", "task-1");

    await expect(service.popListJson("queue")).resolves.toEqual({
      taskId: "task-2"
    });
    await expect(service.popListJson("queue")).resolves.toBeNull();
  });

  it("reports disabled health when REDIS_URL is not configured", async () => {
    const service = new RedisService(() => new FakeRedisClient(), undefined);

    await expect(service.checkHealth()).resolves.toBe("disabled");
  });

  it("subscribes to Redis messages on a dedicated subscriber client", async () => {
    const clients: FakeRedisClient[] = [];
    const service = new RedisService(() => {
      const client = new FakeRedisClient();
      clients.push(client);
      return client;
    }, "redis://redis:6379");
    const listener = jest.fn();

    await service.publish("image-task:task-1", "existing message");
    const unsubscribe = await service.subscribe("image-task:task-1", listener);
    clients[1]?.emitMessage(
      "image-task:task-1",
      JSON.stringify({ taskId: "task-1" })
    );

    expect(clients).toHaveLength(2);
    expect(clients[0]?.publish).toHaveBeenCalledWith(
      "image-task:task-1",
      "existing message"
    );
    expect(clients[1]?.subscribe).toHaveBeenCalledWith("image-task:task-1");
    expect(listener).toHaveBeenCalledWith(JSON.stringify({ taskId: "task-1" }));

    unsubscribe();
  });
});
