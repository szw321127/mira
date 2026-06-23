import { jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { RedisService } from "../cache/redis.service.js";
import { ImageQueueService } from "./image-queue.service.js";

describe("ImageQueueService", () => {
  it("stores task payloads on the Mira image Redis queue", async () => {
    const redis = createRedis();
    const queue = new ImageQueueService(redis);

    await queue.enqueue({
      taskId: "task-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "generate"
    });

    expect(redis.setJson).toHaveBeenCalledWith(
      "mira:image-task:queue",
      [
        {
          taskId: "task-1",
          workspaceId: "workspace-1",
          userId: "user-1",
          type: "generate"
        }
      ],
      86400
    );
    await expect(queue.claimNext()).resolves.toEqual({
      taskId: "task-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "generate"
    });
  });

  it("records public progress events without raw tool or provider payloads", async () => {
    const redis = createRedis();
    const queue = new ImageQueueService(redis);

    await queue.emitEvent("task-1", {
      type: "task-progress",
      taskId: "task-1",
      status: "running",
      message: "正在生成图像"
    });

    await expect(queue.listEvents("task-1")).resolves.toEqual([
      {
        type: "task-progress",
        taskId: "task-1",
        status: "running",
        message: "正在生成图像"
      }
    ]);
    expect(JSON.stringify(await queue.listEvents("task-1"))).not.toMatch(
      /tool_call|tool_result|sk-live-secret|b64_json/
    );
  });

  it("removes canceled tasks from the pending queue", async () => {
    const redis = createRedis();
    const queue = new ImageQueueService(redis);

    await queue.enqueue({
      taskId: "task-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "generate"
    });
    await queue.enqueue({
      taskId: "task-2",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "edit"
    });

    await queue.remove("task-1");

    await expect(queue.claimNext()).resolves.toEqual({
      taskId: "task-2",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "edit"
    });
  });

  it("removes canceled Redis list tasks when the JSON queue snapshot is missing", async () => {
    const redis = createRedis();
    await redis.pushListJson("mira:image-task:queue", {
      taskId: "task-cancel",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "generate"
    });
    const apiQueue = new ImageQueueService(redis);
    const workerQueue = new ImageQueueService(redis);

    await apiQueue.remove("task-cancel");

    await expect(workerQueue.claimNext()).resolves.toBeNull();
  });

  it("claims a Redis-backed task only once when two workers race", async () => {
    const redis = createRedis({ delayGetKeys: ["mira:image-task:queue"] });
    const firstWorker = new ImageQueueService(redis);
    const secondWorker = new ImageQueueService(redis);
    const seedQueue = new ImageQueueService(redis);
    await seedQueue.enqueue({
      taskId: "task-race",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "generate"
    });

    const results = await Promise.all([
      firstWorker.claimNext(),
      secondWorker.claimNext()
    ]);

    expect(results).toContainEqual({
      taskId: "task-race",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "generate"
    });
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("receives RedisService through Nest injection for split API and worker processes", async () => {
    const redis = createRedis();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImageQueueService,
        {
          provide: RedisService,
          useValue: redis
        }
      ]
    }).compile();
    const queue = moduleRef.get(ImageQueueService);

    await queue.enqueue({
      taskId: "task-nest",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "generate"
    });

    expect(redis.setJson).toHaveBeenCalledWith(
      "mira:image-task:queue",
      [
        {
          taskId: "task-nest",
          workspaceId: "workspace-1",
          userId: "user-1",
          type: "generate"
        }
      ],
      86400
    );
  });

  it("delivers task events across split API and worker queue instances", async () => {
    const redis = createRedis();
    const apiQueue = new ImageQueueService(redis);
    const workerQueue = new ImageQueueService(redis);
    const listener = jest.fn();

    const unsubscribe = await apiQueue.subscribe("task-1", listener);

    await workerQueue.emitEvent("task-1", {
      type: "task-progress",
      taskId: "task-1",
      status: "running",
      message: "正在生成图像"
    });

    expect(listener).toHaveBeenCalledWith({
      type: "task-progress",
      taskId: "task-1",
      status: "running",
      message: "正在生成图像"
    });

    unsubscribe();
  });
});

function createRedis(options: { delayGetKeys?: string[] } = {}) {
  const values = new Map<string, unknown>();
  const lists = new Map<string, unknown[]>();
  const listeners = new Map<string, Set<(message: string) => void>>();
  const delayGetKeys = new Set(options.delayGetKeys ?? []);
  return {
    getJson: jest.fn(async (key: string) => {
      const value = cloneJson(values.get(key) ?? null);
      if (delayGetKeys.has(key)) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return value;
    }),
    setJson: jest.fn((key: string, value: unknown) => {
      values.set(key, cloneJson(value));
      return Promise.resolve();
    }),
    pushListJson: jest.fn((key: string, value: unknown) => {
      const list = lists.get(key) ?? [];
      list.unshift(cloneJson(value));
      lists.set(key, list);
      return Promise.resolve();
    }),
    popListJson: jest.fn((key: string) => {
      const list = lists.get(key) ?? [];
      const value = list.pop() ?? null;
      lists.set(key, list);
      return Promise.resolve(cloneJson(value));
    }),
    removeListJson: jest.fn((key: string, value: unknown) => {
      const serialized = JSON.stringify(value);
      const list = lists.get(key) ?? [];
      const filtered = list.filter((item) => JSON.stringify(item) !== serialized);
      lists.set(key, filtered);
      return Promise.resolve();
    }),
    removeListJsonByField: jest.fn(
      (key: string, field: string, value: string) => {
        const list = lists.get(key) ?? [];
        const filtered = list.filter((item) => {
          const record = item as Record<string, unknown>;
          return record[field] !== value;
        });
        lists.set(key, filtered);
        return Promise.resolve();
      }
    ),
    publish: jest.fn((channel: string, message: string) => {
      for (const listener of listeners.get(channel) ?? []) listener(message);
      return Promise.resolve();
    }),
    subscribe: jest.fn((channel: string, listener: (message: string) => void) => {
      const channelListeners = listeners.get(channel) ?? new Set();
      channelListeners.add(listener);
      listeners.set(channel, channelListeners);
      return Promise.resolve(() => {
        channelListeners.delete(listener);
      });
    })
  };
}

function cloneJson<T>(value: T): T {
  return value === null || value === undefined
    ? value
    : (JSON.parse(JSON.stringify(value)) as T);
}
