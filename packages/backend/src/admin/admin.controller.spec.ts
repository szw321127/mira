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
  let prisma: MockPrismaService;

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
        TAVILY_API_KEY: "tavily-secret",
        RESEND_API_KEY: "resend-secret",
        RESEND_FROM: "Mira <noreply@example.com>",
        RESEND_TEMPLATE_ID: "tmpl_login_code",
        RESEND_TEMPLATE_CODE_VARIABLE: "verificationCode"
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
    jest.restoreAllMocks();
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

  it("requires an admin session for user management", async () => {
    await request(server).get("/admin/users").expect(401);
  });

  it("requires an admin session for image usage reporting", async () => {
    await request(server).get("/admin/image-usage").expect(401);
  });

  it("requires an admin session for image provider testing", async () => {
    await request(server).post("/admin/image-provider/test").expect(401);
  });

  it("lists users for authenticated admins", async () => {
    const agent = request.agent(server);
    await agent
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(200);

    const response = await agent
      .get("/admin/users")
      .query({ query: "a@example.com" })
      .expect(200);

    expect(response.body).toEqual({
      users: [
        {
          id: "user-1",
          email: "a@example.com",
          status: "enabled",
          createdAt: "2026-06-01T00:00:00.000Z",
          lastLoginAt: "2026-06-02T00:00:00.000Z",
          conversationCount: 3
        }
      ],
      total: 1,
      page: 1,
      pageSize: 20
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: { contains: "a@example.com", mode: "insensitive" }
        },
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 20,
        include: { _count: { select: { conversations: true } } }
      })
    );
  });

  it("returns image task usage reporting for authenticated admins", async () => {
    const agent = request.agent(server);
    await agent
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(200);

    const response = await agent.get("/admin/image-usage").expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        activeUsers: 2,
        estimatedCostUsd: 0.142,
        totalTasks: 4,
        windowDays: 30,
        statusCounts: {
          canceled: 0,
          complete: 2,
          failed: 1,
          queued: 1,
          running: 0
        }
      })
    );
    expect(response.body.byProvider).toEqual(
      expect.arrayContaining([
        {
          estimatedCostUsd: 0.142,
          provider: "openai",
          taskCount: 2
        }
      ])
    );
    expect(response.body.byType).toEqual(
      expect.arrayContaining([
        {
          estimatedCostUsd: 0.142,
          taskCount: 2,
          type: "generate"
        },
        {
          estimatedCostUsd: 0,
          taskCount: 1,
          type: "edit"
        }
      ])
    );
    expect(prisma.imageTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          cost: true,
          createdAt: true,
          status: true,
          type: true,
          userId: true
        }
      })
    );
  });

  it("returns a safe image provider test result for authenticated admins", async () => {
    const agent = request.agent(server);
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve({ id: "gpt-image-1" }),
      ok: true,
      status: 200
    } as Response);

    await agent
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(200);

    await agent
      .put("/admin/secrets")
      .send({
        secrets: {
          IMAGE_PROVIDER: "openai",
          OPENAI_IMAGE_API_KEY: "sk-live-secret",
          OPENAI_IMAGE_MODEL: "gpt-image-1"
        }
      })
      .expect(200);

    const response = await agent.post("/admin/image-provider/test").expect(200);

    expect(response.body).toEqual({
      configured: true,
      missingKeys: [],
      model: "gpt-image-1",
      ok: true,
      provider: "openai",
      message: "图像 Provider 配置可用"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models/gpt-image-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-live-secret"
        }),
        method: "GET"
      })
    );
    expect(JSON.stringify(response.body)).not.toContain("sk-live-secret");
  });

  it("reports missing image provider keys without exposing secret values", async () => {
    const agent = request.agent(server);
    await agent
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(200);

    const response = await agent.post("/admin/image-provider/test").expect(200);

    expect(response.body).toEqual({
      configured: false,
      missingKeys: ["OPENAI_IMAGE_API_KEY"],
      model: "gpt-image-1",
      ok: false,
      provider: "openai",
      message: "图像 Provider 缺少必要配置"
    });
    expect(JSON.stringify(response.body)).not.toContain("model-secret");
    expect(JSON.stringify(response.body)).not.toContain("tavily-secret");
  });

  it("treats unsafe page values as page one", async () => {
    const agent = request.agent(server);
    await agent
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(200);

    const response = await agent
      .get("/admin/users")
      .query({ page: "100000000000000000000" })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        page: 1,
        pageSize: 20
      })
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20
      })
    );
  });

  it("disables users and revokes their sessions", async () => {
    const agent = request.agent(server);
    await agent
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(200);

    const response = await agent
      .patch("/admin/users/user-1/status")
      .send({ status: "disabled" })
      .expect(200);

    expect(response.body).toEqual({
      user: {
        id: "user-1",
        email: "a@example.com",
        status: "disabled",
        createdAt: "2026-06-01T00:00:00.000Z",
        lastLoginAt: "2026-06-02T00:00:00.000Z"
      }
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { status: "disabled" }
    });
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
  });

  it("rejects invalid user status without updating users", async () => {
    const agent = request.agent(server);
    await agent
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(200);

    const response = await agent
      .patch("/admin/users/user-1/status")
      .send({ status: "archived" })
      .expect(400);

    expect(response.body).toEqual({ message: "Invalid user status." });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.userSession.updateMany).not.toHaveBeenCalled();
  });

  it("returns not found when updating a missing user", async () => {
    const agent = request.agent(server);
    await agent
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(200);

    const response = await agent
      .patch("/admin/users/missing-user/status")
      .send({ status: "disabled" })
      .expect(404);

    expect(response.body).toEqual(
      expect.objectContaining({ message: "User not found." })
    );
    expect(prisma.userSession.updateMany).not.toHaveBeenCalled();
  });

  it("returns masked database-managed secrets for authenticated admins", async () => {
    const agent = request.agent(server);
    await agent
      .post("/admin/login")
      .send({ username: "owner", password: "initial-pass" })
      .expect(200);

    const response = await agent.get("/admin/secrets").expect(200);

    expect(response.body.secrets).toEqual(
      expect.arrayContaining([
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
        },
        {
          key: "RESEND_API_KEY",
          label: "Resend API Key",
          value: "re********et",
          masked: true
        },
        {
          key: "RESEND_FROM",
          label: "Resend From",
          value: "Mira <noreply@example.com>",
          masked: false
        },
        {
          key: "RESEND_TEMPLATE_ID",
          label: "Resend Template ID",
          value: "tmpl_login_code",
          masked: false
        },
        {
          key: "RESEND_TEMPLATE_CODE_VARIABLE",
          label: "Resend 验证码变量名",
          value: "verificationCode",
          masked: false
        }
      ])
    );
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
          TAVILY_API_KEY: "new-tavily-secret",
          RESEND_TEMPLATE_ID: "tmpl_next_code",
          RESEND_TEMPLATE_CODE_VARIABLE: "code"
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
        }),
        expect.objectContaining({
          key: "RESEND_TEMPLATE_ID",
          value: "tmpl_next_code",
          masked: false
        }),
        expect.objectContaining({
          key: "RESEND_TEMPLATE_CODE_VARIABLE",
          value: "code",
          masked: false
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
        }),
        expect.objectContaining({
          key: "RESEND_API_KEY",
          value: "",
          masked: false
        }),
        expect.objectContaining({
          key: "RESEND_FROM",
          value: "",
          masked: false
        }),
        expect.objectContaining({
          key: "RESEND_TEMPLATE_ID",
          value: "",
          masked: false
        }),
        expect.objectContaining({
          key: "RESEND_TEMPLATE_CODE_VARIABLE",
          value: "",
          masked: false
        })
      ])
    );
  });
});

type MockPrismaService = PrismaService & {
  imageTask: {
    findMany: jest.Mock;
  };
  user: {
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  userSession: {
    updateMany: jest.Mock;
  };
};

function createPrismaStore(initialValue?: unknown): MockPrismaService {
  let row: { key: string; value: unknown; updatedAt: Date } | null = initialValue
    ? { key: "admin", value: initialValue, updatedAt: new Date() }
    : null;
  const users = [
    {
      id: "user-1",
      email: "a@example.com",
      status: "enabled",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      lastLoginAt: new Date("2026-06-02T00:00:00.000Z"),
      _count: { conversations: 3 }
    }
  ];
  const imageTasks = [
    {
      id: "task-1",
      userId: "user-1",
      type: "generate",
      status: "complete",
      createdAt: new Date("2026-06-23T08:00:00.000Z"),
      cost: {
        provider: "openai",
        model: "gpt-image-1",
        size: "1024x1024",
        quality: "auto",
        estimatedCostUsd: 0.042
      }
    },
    {
      id: "task-2",
      userId: "user-2",
      type: "generate",
      status: "complete",
      createdAt: new Date("2026-06-23T09:00:00.000Z"),
      cost: {
        provider: "openai",
        model: "gpt-image-1.5",
        size: "1536x1024",
        quality: "high",
        estimatedCostUsd: 0.1
      }
    },
    {
      id: "task-3",
      userId: "user-1",
      type: "edit",
      status: "failed",
      createdAt: new Date("2026-06-23T10:00:00.000Z"),
      cost: null
    },
    {
      id: "task-4",
      userId: "user-1",
      type: "variation",
      status: "queued",
      createdAt: new Date("2026-06-23T11:00:00.000Z"),
      cost: null
    }
  ];

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
    },
    imageTask: {
      findMany: jest.fn(() => Promise.resolve(imageTasks))
    },
    user: {
      findMany: jest.fn(() => Promise.resolve(users)),
      count: jest.fn(() => Promise.resolve(users.length)),
      update: jest.fn(
        ({
          where,
          data
        }: {
          where: { id: string };
          data: { status: "enabled" | "disabled" };
        }) => {
          const user = users.find((item) => item.id === where.id);
          if (!user) {
            const error = new Error("User not found") as Error & { code: string };
            error.code = "P2025";
            return Promise.reject(error);
          }
          const updated = { ...user, status: data.status };
          return Promise.resolve(updated);
        }
      )
    },
    userSession: {
      updateMany: jest.fn(() => Promise.resolve({ count: 1 }))
    }
  } as unknown as MockPrismaService;
}
