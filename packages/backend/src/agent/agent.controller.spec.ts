import { Test } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { jest } from "@jest/globals";
import request from "supertest";
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { AgentController } from "./agent.controller.js";
import { AgentService } from "./agent.service.js";
import { ModelConfigurationError } from "./model-factory.js";
import { UserSessionService } from "../auth/user-session.service.js";

describe("AgentController", () => {
  let app: INestApplication;
  let server: Server;
  const streamChat = jest.fn();
  const requireUser = jest.fn();

  beforeEach(async () => {
    streamChat.mockReset();
    requireUser.mockReset();
    requireUser.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      status: "enabled"
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        {
          provide: AgentService,
          useValue: {
            streamChat
          }
        },
        {
          provide: UserSessionService,
          useValue: {
            requireUser
          }
        }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects invalid chat requests", async () => {
    const response = await request(server)
      .post("/agent/chat")
      .set("Cookie", "mira_user_session=session-token")
      .send({ conversationId: "c1", messages: [{ role: "system", content: "x" }] })
      .expect(400);

    expect(response.body).toEqual({ message: "Invalid agent chat request." });
    expect(requireUser).toHaveBeenCalledWith("session-token");
    expect(streamChat).not.toHaveBeenCalled();
  });

  it("rejects missing sessions before starting a stream", async () => {
    requireUser.mockRejectedValueOnce(
      new UnauthorizedException("User session required.")
    );

    await request(server)
      .post("/agent/chat")
      .send({
        conversationId: "c1",
        messages: [{ role: "user", content: "你好" }]
      })
      .expect(401);

    expect(requireUser).toHaveBeenCalledWith(undefined);
    expect(streamChat).not.toHaveBeenCalled();
  });

  it("returns setup guidance when model config is missing", async () => {
    streamChat.mockImplementationOnce(async function* () {
      await Promise.resolve();
      throw new ModelConfigurationError("需要配置模型后才能运行 agent。");
      yield { type: "error", message: "unreachable" };
    });

    const response = await request(server)
      .post("/agent/chat")
      .set("Cookie", "mira_user_session=session-token")
      .send({
        conversationId: "c1",
        messages: [{ role: "user", content: "你好" }]
      })
      .expect(503);

    expect(response.body).toEqual({ message: "需要配置模型后才能运行 agent。" });
  });

  it("streams newline-delimited agent events", async () => {
    streamChat.mockImplementationOnce(async function* () {
      await Promise.resolve();
      yield { type: "text-delta", text: "你好" };
      yield { type: "stop", reason: "complete" };
    });

    const response = await request(server)
      .post("/agent/chat")
      .set("Cookie", "mira_user_session=session-token")
      .send({
        conversationId: "c1",
        messages: [{ role: "user", content: "你好" }]
      })
      .expect(200);

    expect(response.headers["content-type"]).toContain("application/x-ndjson");
    expect(response.text).toBe(
      '{"type":"text-delta","text":"你好"}\n{"type":"stop","reason":"complete"}\n'
    );
    expect(requireUser).toHaveBeenCalledWith("session-token");
  });
});
