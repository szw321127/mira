import { jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { AdminStore } from "./admin-store.js";
import { PrismaService } from "../database/prisma.service.js";

describe("AdminController", () => {
  const originalEnv = { ...process.env };
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      ADMIN_USERNAME: "owner",
      ADMIN_PASSWORD: "initial-pass",
      SESSION_SECRET: "test-session-secret",
      AGENT_MODEL_BASE_URL: "https://env-model.example/v1",
      AGENT_MODEL_NAME: "env-model",
      AGENT_MODEL_API_KEY: "env-model-secret",
      TAVILY_API_KEY: "env-tavily-secret"
    };
    prisma = createPrismaStore({
      secrets: {
        AGENT_MODEL_BASE_URL: "https://model.example/v1",
        AGENT_MODEL_NAME: "mira-large",
        AGENT_MODEL_API_KEY: "model-secret",
        TAVILY_API_KEY: "tavily-secret"
      }
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        AdminService,
        AdminStore,
        {
          provide: PrismaService,
          useValue: prisma
        }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    await app?.close();
    process.env = originalEnv;
  });

  it("rejects invalid admin login", async () => {
    const response = await request(server)
      .post("/admin/login")
      .send({ username: "owner", password: "wrong-pass" })
      .expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({ message: "Invalid admin credentials." })
    );
  });

  it("creates an httpOnly session cookie after valid login", async () => {
    const response = await request(server)
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(200);

    expect(response.body).toEqual({ username: "owner" });
    expect(response.headers["set-cookie"]?.[0]).toContain("mira_admin_session=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });

  it("requires an admin session for secret management", async () => {
    await request(server).get("/admin/secrets").expect(401);
  });

  it("returns masked database-managed secrets for authenticated admins", async () => {
    const agent = request.agent(server);
    await agent
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(200);

    const response = await agent.get("/admin/secrets").expect(200);

    expect(response.body).toEqual({
      secrets: [
        {
          key: "AGENT_MODEL_BASE_URL",
          label: "模型 Base URL",
          value: "https://model.example/v1",
          masked: false
        },
        {
          key: "AGENT_MODEL_NAME",
          label: "模型名称",
          value: "mira-large",
          masked: false
        },
        {
          key: "AGENT_MODEL_API_KEY",
          label: "模型 API Key",
          value: "mo********et",
          masked: true
        },
        {
          key: "TAVILY_API_KEY",
          label: "Tavily 搜索 Key",
          value: "ta********et",
          masked: true
        }
      ]
    });
  });

  it("updates secrets without writing them to process.env", async () => {
    const agent = request.agent(server);
    await agent
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(200);

    await agent
      .put("/admin/secrets")
      .send({
        secrets: {
          AGENT_MODEL_NAME: "mira-admin",
          TAVILY_API_KEY: "new-tavily-secret"
        }
      })
      .expect(200);

    const response = await agent.get("/admin/secrets").expect(200);

    expect(process.env.TAVILY_API_KEY).toBe("env-tavily-secret");
    expect(response.body.secrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "AGENT_MODEL_NAME",
          value: "mira-admin",
          masked: false
        }),
        expect.objectContaining({
          key: "TAVILY_API_KEY",
          value: "ne********et",
          masked: true
        })
      ])
    );
  });

  it("changes the admin password for future logins", async () => {
    const agent = request.agent(server);
    await agent
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(200);

    await agent
      .post("/admin/password")
      .send({ currentPassword: "initial-pass", newPassword: "next-pass-123" })
      .expect(200);

    await request(server)
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(401);

    await request(server)
      .post("/admin/login")
      .send({ username: "owner", password: "next-pass-123" })
      .expect(200);
  });

  it("does not expose model or search keys from environment fallback", async () => {
    await app.close();
    prisma = createPrismaStore();

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        AdminService,
        AdminStore,
        {
          provide: PrismaService,
          useValue: prisma
        }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;

    const agent = request.agent(server);
    await agent
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(200);

    const response = await agent.get("/admin/secrets").expect(200);

    expect(response.body.secrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "AGENT_MODEL_BASE_URL",
          value: "",
          masked: false
        }),
        expect.objectContaining({
          key: "AGENT_MODEL_API_KEY",
          value: "",
          masked: false
        }),
        expect.objectContaining({
          key: "TAVILY_API_KEY",
          value: "",
          masked: false
        })
      ])
    );
  });
});

function createPrismaStore(initialValue?: unknown) {
  let row: { key: string; value: unknown; updatedAt: Date } | null = initialValue
    ? { key: "admin", value: initialValue, updatedAt: new Date() }
    : null;

  return {
    adminStoreEntry: {
      findUnique: jest.fn(({ where }: { where: { key: string } }) => {
        return Promise.resolve(row && where.key === row.key ? row : null);
      }),
      upsert: jest.fn(
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
      )
    }
  } as unknown as PrismaService;
}
