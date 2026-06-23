import { Inject, Injectable, Optional } from "@nestjs/common";
import { RedisService } from "../cache/redis.service.js";
import type { ImageTaskEvent, ImageTaskQueuePayload } from "./image-task-events.js";

export const IMAGE_TASK_QUEUE_KEY = "mira:image-task:queue";
export const IMAGE_TASK_LOCK_KEY_PREFIX = "mira:image-task:lock:";
export const IMAGE_TASK_EVENTS_KEY_PREFIX = "mira:image-task:events:";

type QueueRedis = Pick<RedisService, "getJson" | "setJson">;
type ListRedis = Pick<
  RedisService,
  "popListJson" | "pushListJson" | "removeListJson" | "removeListJsonByField"
>;
type EventRedis = Pick<RedisService, "publish" | "subscribe">;
type ImageTaskListener = (event: ImageTaskEvent) => void;

const QUEUE_TTL_SECONDS = 24 * 60 * 60;
const EVENTS_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class ImageQueueService {
  private readonly memoryEvents = new Map<string, ImageTaskEvent[]>();
  private memoryQueue: ImageTaskQueuePayload[] = [];
  private readonly listeners = new Map<string, Set<ImageTaskListener>>();

  constructor(
    @Optional()
    @Inject(RedisService)
    private readonly redis?: QueueRedis & Partial<ListRedis & EventRedis>
  ) {}

  async enqueue(payload: ImageTaskQueuePayload): Promise<void> {
    if (await this.pushQueueItem(payload)) return;

    const queue = await this.readQueue();
    queue.push(payload);
    await this.writeQueue(queue);
  }

  async claimNext(): Promise<ImageTaskQueuePayload | null> {
    const claimed = await this.popQueueItem();
    if (claimed.handled) return claimed.payload;

    const queue = await this.readQueue();
    const next = queue.shift() ?? null;
    await this.writeQueue(queue);
    return next;
  }

  async remove(taskId: string): Promise<void> {
    const queue = await this.readQueue();
    if (this.redis?.removeListJsonByField) {
      try {
        await this.redis.removeListJsonByField(
          IMAGE_TASK_QUEUE_KEY,
          "taskId",
          taskId
        );
      } catch {
        await Promise.all(
          queue
            .filter((payload) => payload.taskId === taskId)
            .map((payload) => this.removeQueueItem(payload))
        );
      }
    } else if (this.redis?.removeListJson) {
      await Promise.all(
        queue
          .filter((payload) => payload.taskId === taskId)
          .map((payload) => this.removeQueueItem(payload))
      );
    }
    await this.writeQueue(queue.filter((payload) => payload.taskId !== taskId));
  }

  async emitEvent(taskId: string, event: ImageTaskEvent): Promise<void> {
    const events = await this.readEvents(taskId);
    events.push(event);
    await this.writeEvents(taskId, events);

    if (await this.publishEvent(taskId, event)) {
      return;
    }

    this.notifyLocalListeners(taskId, event);
  }

  async listEvents(taskId: string): Promise<ImageTaskEvent[]> {
    return this.readEvents(taskId);
  }

  async subscribe(
    taskId: string,
    listener: ImageTaskListener
  ): Promise<() => void> {
    const listeners = this.listeners.get(taskId) ?? new Set<ImageTaskListener>();
    listeners.add(listener);
    this.listeners.set(taskId, listeners);
    const unsubscribeLocal = () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(taskId);
    };

    const unsubscribeRedis = await this.subscribeToRedis(taskId, listener);
    return () => {
      unsubscribeLocal();
      unsubscribeRedis?.();
    };
  }

  lockKey(taskId: string): string {
    return `${IMAGE_TASK_LOCK_KEY_PREFIX}${taskId}`;
  }

  private async readQueue(): Promise<ImageTaskQueuePayload[]> {
    const value = await this.readJson<ImageTaskQueuePayload[]>(IMAGE_TASK_QUEUE_KEY);
    return Array.isArray(value) ? value : [...this.memoryQueue];
  }

  private async writeQueue(queue: ImageTaskQueuePayload[]): Promise<void> {
    this.memoryQueue = [...queue];
    await this.writeJson(IMAGE_TASK_QUEUE_KEY, queue, QUEUE_TTL_SECONDS);
  }

  private async pushQueueItem(payload: ImageTaskQueuePayload): Promise<boolean> {
    if (!this.redis?.pushListJson) return false;
    try {
      await this.redis.pushListJson(IMAGE_TASK_QUEUE_KEY, payload, QUEUE_TTL_SECONDS);
      await this.writeQueue([...this.memoryQueue, payload]);
      return true;
    } catch {
      return false;
    }
  }

  private async popQueueItem(): Promise<{
    handled: boolean;
    payload: ImageTaskQueuePayload | null;
  }> {
    if (!this.redis?.popListJson) return { handled: false, payload: null };
    try {
      const payload = await this.redis.popListJson<ImageTaskQueuePayload>(
        IMAGE_TASK_QUEUE_KEY
      );
      if (payload) {
        this.memoryQueue = this.memoryQueue.filter(
          (item) => item.taskId !== payload.taskId
        );
      }
      return { handled: true, payload };
    } catch {
      return { handled: false, payload: null };
    }
  }

  private async removeQueueItem(payload: ImageTaskQueuePayload): Promise<void> {
    if (!this.redis?.removeListJson) return;
    try {
      await this.redis.removeListJson(IMAGE_TASK_QUEUE_KEY, payload);
    } catch {
      // The JSON fallback below still removes the task from the compatibility snapshot.
    }
  }

  private async readEvents(taskId: string): Promise<ImageTaskEvent[]> {
    const key = eventKey(taskId);
    const value = await this.readJson<ImageTaskEvent[]>(key);
    return Array.isArray(value) ? value : [...(this.memoryEvents.get(taskId) ?? [])];
  }

  private async writeEvents(taskId: string, events: ImageTaskEvent[]): Promise<void> {
    this.memoryEvents.set(taskId, [...events]);
    await this.writeJson(eventKey(taskId), events, EVENTS_TTL_SECONDS);
  }

  private async readJson<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      return await this.redis.getJson<T>(key);
    } catch {
      return null;
    }
  }

  private async writeJson(
    key: string,
    value: unknown,
    ttlSeconds: number
  ): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.setJson(key, value, ttlSeconds);
    } catch {
      // Local development can run without Redis; in-memory state keeps the task UI usable.
    }
  }

  private async publishEvent(
    taskId: string,
    event: ImageTaskEvent
  ): Promise<boolean> {
    if (!this.redis?.publish) return false;
    try {
      await this.redis.publish(eventChannel(taskId), JSON.stringify(event));
      return true;
    } catch {
      return false;
    }
  }

  private async subscribeToRedis(
    taskId: string,
    listener: ImageTaskListener
  ): Promise<(() => void) | null> {
    if (!this.redis?.subscribe) return null;
    try {
      return await this.redis.subscribe(eventChannel(taskId), (message) => {
        const event = parseEventMessage(message);
        if (event) listener(event);
      });
    } catch {
      return null;
    }
  }

  private notifyLocalListeners(taskId: string, event: ImageTaskEvent) {
    for (const listener of this.listeners.get(taskId) ?? []) {
      listener(event);
    }
  }
}

function eventKey(taskId: string): string {
  return `${IMAGE_TASK_EVENTS_KEY_PREFIX}${taskId}`;
}

function eventChannel(taskId: string): string {
  return `${IMAGE_TASK_EVENTS_KEY_PREFIX}${taskId}:pubsub`;
}

function parseEventMessage(message: string): ImageTaskEvent | null {
  try {
    const value = JSON.parse(message) as ImageTaskEvent;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}
