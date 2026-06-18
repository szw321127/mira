import { jest } from "@jest/globals";
import { AdminStore } from "./admin-store.js";
import type { PrismaService } from "../database/prisma.service.js";

function createPrismaStore(initialValue?: unknown) {
  let row = initialValue
    ? { key: "admin", value: initialValue, updatedAt: new Date() }
    : null;
  const upsert = jest.fn(
    ({
      where,
      create,
      update
    }: {
      where: { key: string };
      create: { key: string; value: unknown };
      update: { value: unknown };
    }) => {
      row = {
        key: where.key,
        value: update.value ?? create.value,
        updatedAt: new Date()
      };
      return Promise.resolve(row);
    }
  );

  const prisma = {
    adminStoreEntry: {
      findUnique: jest.fn(({ where }: { where: { key: string } }) => {
        return Promise.resolve(row && where.key === row.key ? row : null);
      }),
      upsert
    }
  };

  return { prisma: prisma as unknown as PrismaService, upsert };
}

describe("AdminStore", () => {
  it("returns an empty object when the admin store row does not exist", async () => {
    const { prisma } = createPrismaStore();
    const store = new AdminStore(prisma);

    await expect(store.read()).resolves.toEqual({});
  });

  it("persists admin data in the singleton database row", async () => {
    const { prisma, upsert } = createPrismaStore();
    const store = new AdminStore(prisma);

    await store.write({
      passwordHash: "scrypt:salt:key",
      secrets: {
        AGENT_MODEL_NAME: "mira-large"
      }
    });

    await expect(store.read()).resolves.toEqual({
      passwordHash: "scrypt:salt:key",
      secrets: {
        AGENT_MODEL_NAME: "mira-large"
      }
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "admin" }
      })
    );
  });
});
