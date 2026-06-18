import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import prismaClientPackage from "@prisma/client";
import { Pool } from "pg";
import { resolveDatabaseUrl } from "../config/database-url.js";

const { PrismaClient } = prismaClientPackage;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool?: Pool;

  constructor() {
    const databaseUrl = resolveDatabaseUrl();
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL or PostgreSQL database variables are required."
      );
    }

    const pool = new Pool({ connectionString: databaseUrl });

    super(
      {
        adapter: new PrismaPg(pool)
      }
    );

    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool?.end();
  }
}
