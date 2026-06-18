import { Injectable, OnModuleDestroy } from "@nestjs/common";
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
  ping(): Promise<string>;
  quit(): Promise<unknown>;
};
type RedisClientFactory = (url: string) => RedisClient;

export type RedisHealth = "ok" | "disabled" | "unavailable";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client?: RedisClient;

  constructor(
    private readonly createClient: RedisClientFactory = (url) =>
      new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 2
      }),
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
  }

  private getClient() {
    if (!this.redisUrl) {
      throw new Error("REDIS_URL is not configured.");
    }

    this.client ??= this.createClient(this.redisUrl);
    return this.client;
  }
}
