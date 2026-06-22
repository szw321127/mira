import { UnauthorizedException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { jest } from "@jest/globals";
import type { Server } from "node:http";
import request from "supertest";
import { UserSessionService } from "../auth/user-session.service.js";
import { ConversationsController } from "./conversations.controller.js";
import { ConversationsService } from "./conversations.service.js";

describe("ConversationsController", () => {
  let app: INestApplication;
  let server: Server;
  const list = jest.fn();
  const create = jest.fn();
  const rename = jest.fn();
  const remove = jest.fn();
  const replaceMessages = jest.fn();
  const importConversations = jest.fn();
  const requireUser = jest.fn();

  beforeEach(async () => {
    list.mockReset();
    create.mockReset();
    rename.mockReset();
    remove.mockReset();
    replaceMessages.mockReset();
    importConversations.mockReset();
    requireUser.mockReset();

    requireUser.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      status: "enabled"
    });
    list.mockResolvedValue({ conversations: [] });
    create.mockResolvedValue({ conversation: { id: "conversation-1" } });
    rename.mockResolvedValue({ ok: true });
    remove.mockResolvedValue({ ok: true });
    replaceMessages.mockResolvedValue({ ok: true });
    importConversations.mockResolvedValue({ conversations: [] });

    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        {
          provide: ConversationsService,
          useValue: {
            list,
            create,
            rename,
            remove,
            replaceMessages,
            importConversations
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

  it("requires a user session before listing conversations", async () => {
    requireUser.mockRejectedValueOnce(
      new UnauthorizedException("User session required.")
    );

    await request(server).get("/conversations").expect(401);

    expect(requireUser).toHaveBeenCalledWith(undefined);
    expect(list).not.toHaveBeenCalled();
  });

  it("lists conversations for the current user", async () => {
    list.mockResolvedValueOnce({
      conversations: [{ id: "conversation-1", title: "新对话", messages: [] }]
    });

    const response = await request(server)
      .get("/conversations")
      .set("Cookie", "mira_user_session=session-token")
      .expect(200);

    expect(response.body).toEqual({
      conversations: [{ id: "conversation-1", title: "新对话", messages: [] }]
    });
    expect(requireUser).toHaveBeenCalledWith("session-token");
    expect(list).toHaveBeenCalledWith("user-1");
  });

  it("renames conversations with a valid title", async () => {
    const response = await request(server)
      .patch("/conversations/conversation-1")
      .set("Cookie", "mira_user_session=session-token")
      .send({ title: "  Updated title  " })
      .expect(200);

    expect(response.body).toEqual({ ok: true });
    expect(rename).toHaveBeenCalledWith(
      "user-1",
      "conversation-1",
      "Updated title"
    );
  });

  it("rejects invalid rename titles", async () => {
    const response = await request(server)
      .patch("/conversations/conversation-1")
      .set("Cookie", "mira_user_session=session-token")
      .send({ title: "   " })
      .expect(400);

    expect(response.body).toEqual({ message: "Invalid title." });
    expect(rename).not.toHaveBeenCalled();
  });

  it("replaces messages after validating the request body", async () => {
    const messages = [
      {
        id: "m1",
        role: "user",
        content: "hello",
        status: "complete",
        events: [{ type: "submitted" }],
        createdAt: "2026-06-22T10:01:00.000Z"
      }
    ];

    const response = await request(server)
      .post("/conversations/conversation-1/messages")
      .set("Cookie", "mira_user_session=session-token")
      .send({ messages })
      .expect(201);

    expect(response.body).toEqual({ ok: true });
    expect(replaceMessages).toHaveBeenCalledWith(
      "user-1",
      "conversation-1",
      messages
    );
  });

  it("rejects invalid messages", async () => {
    const response = await request(server)
      .post("/conversations/conversation-1/messages")
      .set("Cookie", "mira_user_session=session-token")
      .send({ messages: [{ role: "system", content: "nope" }] })
      .expect(400);

    expect(response.body).toEqual({ message: "Invalid messages." });
    expect(replaceMessages).not.toHaveBeenCalled();
  });

  it("rejects messages with invalid createdAt values", async () => {
    const response = await request(server)
      .post("/conversations/conversation-1/messages")
      .set("Cookie", "mira_user_session=session-token")
      .send({
        messages: [
          {
            role: "user",
            content: "hello",
            createdAt: "not-a-date"
          }
        ]
      })
      .expect(400);

    expect(response.body).toEqual({ message: "Invalid messages." });
    expect(replaceMessages).not.toHaveBeenCalled();
  });

  it("rejects malformed import payloads", async () => {
    const response = await request(server)
      .post("/conversations/import")
      .set("Cookie", "mira_user_session=session-token")
      .send({ conversations: "bad" })
      .expect(400);

    expect(response.body).toEqual({ message: "Invalid conversations." });
    expect(importConversations).not.toHaveBeenCalled();
  });

  it("rejects imported conversations with invalid messages", async () => {
    const response = await request(server)
      .post("/conversations/import")
      .set("Cookie", "mira_user_session=session-token")
      .send({
        conversations: [
          {
            title: "Imported",
            messages: [{ role: "system", content: "nope" }]
          }
        ]
      })
      .expect(400);

    expect(response.body).toEqual({ message: "Invalid conversations." });
    expect(importConversations).not.toHaveBeenCalled();
  });
});
