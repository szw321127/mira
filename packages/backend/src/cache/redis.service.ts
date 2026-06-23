import { Inject, Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import { Redis } from "ioredis";

type RedisClient = {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: "EX",
    ttlSeconds: number
  ): Promise<unknown>;
  del(key: string): Promise<unknown>;
  lpush(key: string, value: string): Promise<unknown>;
  rpop(key: string): Promise<string | null>;
  lrem(key: string, count: number, value: string): Promise<unknown>;
  eval(
    script: string,
    numKeys: number,
    key: string,
    field: string,
    value: string
  ): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  on(
    event: "message",
    listener: (channel: string, message: string) => void
  ): unknown;
  off(
    event: "message",
    listener: (channel: string, message: string) => void
  ): unknown;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
};
type RedisClientFactory = (url: string) => RedisClient;
type RedisMessageListener = (message: string) => void;

export type RedisHealth = "ok" | "disabled" | "unavailable";
export const REDIS_CLIENT_FACTORY = Symbol("REDIS_CLIENT_FACTORY");
export const REDIS_CONNECTION_URL = Symbol("REDIS_CONNECTION_URL");

const defaultRedisClientFactory: RedisClientFactory = (url) =>
  new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2
  });

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client?: RedisClient;
  private subscriber?: RedisClient;
  private readonly channelListeners = new Map<string, Set<RedisMessageListener>>();
  private readonly handleSubscriberMessage = (channel: string, message: string) => {
    for (const listener of this.channelListeners.get(channel) ?? []) {
      listener(message);
    }
  };

  constructor(
    @Optional()
    @Inject(REDIS_CLIENT_FACTORY)
    private readonly createClient: RedisClientFactory = defaultRedisClientFactory,
    @Optional()
    @Inject(REDIS_CONNECTION_URL)
    private readonly redisUrl = process.env.REDIS_URL
  ) {}

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.getClient().get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    await this.getClient().set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  async delete(key: string) {
    await this.getClient().del(key);
  }

  async pushListJson(key: string, value: unknown, ttlSeconds: number) {
    const client = this.getClient();
    await client.lpush(key, JSON.stringify(value));
    await client.expire(key, ttlSeconds);
  }

  async popListJson<T>(key: string): Promise<T | null> {
    const raw = await this.getClient().rpop(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async removeListJson(key: string, value: unknown) {
    await this.getClient().lrem(key, 0, JSON.stringify(value));
  }

  async removeListJsonByField(key: string, field: string, value: string) {
    const script = `
      local key = KEYS[1]
      local field = ARGV[1]
      local expected = ARGV[2]
      local values = redis.call("LRANGE", key, 0, -1)
      local removed = 0
      for _, item in ipairs(values) do
        local ok, decoded = pcall(cjson.decode, item)
        if ok and decoded[field] == expected then
          removed = removed + redis.call("LREM", key, 0, item)
        end
      end
      return removed
    `;
    await this.getClient().eval(script, 1, key, field, value);
  }

  async publish(channel: string, message: string) {
    await this.getClient().publish(channel, message);
  }

  async subscribe(
    channel: string,
    listener: RedisMessageListener
  ): Promise<() => void> {
    const listeners = this.channelListeners.get(channel) ?? new Set();
    const shouldSubscribe = listeners.size === 0;
    listeners.add(listener);
    this.channelListeners.set(channel, listeners);

    if (shouldSubscribe) {
      try {
        await this.getSubscriberClient().subscribe(channel);
      } catch (error) {
        listeners.delete(listener);
        if (listeners.size === 0) this.channelListeners.delete(channel);
        throw error;
      }
    }

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      void this.removeSubscriber(channel, listener);
    };
  }

  async checkHealth(): Promise<RedisHealth> {
    if (!this.redisUrl) return "disabled";

    try {
      const response = await this.getClient().ping();
      return response === "PONG" ? "ok" : "unavailable";
    } catch {
      return "unavailable";
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
    if (this.subscriber && this.subscriber !== this.client) {
      await this.subscriber.quit();
    }
  }

  private getClient() {
    if (!this.redisUrl) {
      throw new Error("REDIS_URL is not configured.");
    }

    this.client ??= this.createClient(this.redisUrl);
    return this.client;
  }

  private getSubscriberClient() {
    if (!this.redisUrl) {
      throw new Error("REDIS_URL is not configured.");
    }

    if (!this.subscriber) {
      this.subscriber = this.createClient(this.redisUrl);
      this.subscriber.on("message", this.handleSubscriberMessage);
    }
    return this.subscriber;
  }

  private async removeSubscriber(
    channel: string,
    listener: RedisMessageListener
  ) {
    const listeners = this.channelListeners.get(channel);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size > 0) return;

    this.channelListeners.delete(channel);
    try {
      await this.subscriber?.unsubscribe(channel);
    } catch {
      // Losing an unsubscribe acknowledgement should not keep request cleanup from finishing.
    }
  }
}
