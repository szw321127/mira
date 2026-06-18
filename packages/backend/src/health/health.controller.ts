import { Controller, Get } from "@nestjs/common";
import { RedisService, type RedisHealth } from "../cache/redis.service.js";
import { PrismaService } from "../database/prisma.service.js";

type ServiceHealth = "ok" | "disabled" | "unavailable";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.redis.checkHealth()
    ]);

    return {
      status: database === "ok" && isHealthyRedis(redis) ? "ok" : "degraded",
      services: {
        database,
        redis
      }
    };
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return "ok";
    } catch {
      return "unavailable";
    }
  }
}

function isHealthyRedis(status: RedisHealth) {
  return status === "ok" || status === "disabled";
}
