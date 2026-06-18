import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { AdminStoreData } from "./admin.types.js";

const ADMIN_STORE_KEY = "admin";

@Injectable()
export class AdminStore {
  constructor(private readonly prisma: PrismaService) {}

  async read(): Promise<AdminStoreData> {
    const row = await this.prisma.adminStoreEntry.findUnique({
      where: { key: ADMIN_STORE_KEY }
    });

    if (!row || !isAdminStoreData(row.value)) return {};
    return row.value;
  }

  async write(data: AdminStoreData): Promise<void> {
    await this.prisma.adminStoreEntry.upsert({
      where: { key: ADMIN_STORE_KEY },
      create: {
        key: ADMIN_STORE_KEY,
        value: data
      },
      update: {
        value: data
      }
    });
  }
}

function isAdminStoreData(value: unknown): value is AdminStoreData {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
