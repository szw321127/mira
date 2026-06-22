import type { INestApplication } from "@nestjs/common";
import { jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { UserSessionService } from "./user-session.service.js";

describe("AuthController", () => {
  let app: INestApplication;
  let server: Server;
  const requestCode = jest.fn();
  const login = jest.fn();
  const requireUser = jest.fn();
  const revokeToken = jest.fn();

  beforeEach(async () => {
    requestCode.mockReset();
    login.mockReset();
    requireUser.mockReset();
    revokeToken.mockReset();

    requestCode.mockResolvedValue({ ok: true });
    login.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com", status: "enabled" },
      token: "session-token"
    });
    requireUser.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      status: "enabled"
    });
    revokeToken.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            requestCode,
            login
          }
        },
        {
          provide: UserSessionService,
          useValue: {
            requireUser,
            revokeToken
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

  it("normalizes valid code requests and forwards the request IP", async () => {
    await request(server)
      .post("/auth/code")
      .set("x-forwarded-for", "203.0.113.10, 198.51.100.20")
      .send({ email: " User@Example.COM " })
      .expect(201, { ok: true });

    expect(requestCode).toHaveBeenCalledWith("user@example.com", "203.0.113.10");
  });

  it("rejects invalid code requests", async () => {
    const response = await request(server)
      .post("/auth/code")
      .send({ email: "invalid" })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({ message: "请输入有效邮箱" })
    );
    expect(requestCode).not.toHaveBeenCalled();
  });

  it("sets an httpOnly user session cookie after login", async () => {
    const response = await request(server)
      .post("/auth/login")
      .send({ email: " User@Example.COM ", code: "123456" })
      .expect(201);

    expect(response.body).toEqual({
      user: { id: "user-1", email: "user@example.com", status: "enabled" }
    });
    expect(login).toHaveBeenCalledWith("user@example.com", "123456");
    expect(response.headers["set-cookie"]?.[0]).toContain("mira_user_session=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });

  it("rejects invalid login requests", async () => {
    const response = await request(server)
      .post("/auth/login")
      .send({ email: "user@example.com", code: "12345" })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({ message: "请输入有效邮箱和 6 位验证码" })
    );
    expect(login).not.toHaveBeenCalled();
  });

  it("returns the current user from the session cookie", async () => {
    const response = await request(server)
      .get("/auth/session")
      .set("Cookie", "mira_user_session=session-token")
      .expect(200);

    expect(response.body).toEqual({
      user: { id: "user-1", email: "user@example.com", status: "enabled" }
    });
    expect(requireUser).toHaveBeenCalledWith("session-token");
  });

  it("revokes the session token and clears the cookie on logout", async () => {
    const response = await request(server)
      .post("/auth/logout")
      .set("Cookie", "mira_user_session=session-token")
      .expect(201, { ok: true });

    expect(revokeToken).toHaveBeenCalledWith("session-token");
    expect(response.headers["set-cookie"]?.[0]).toContain("mira_user_session=");
    expect(response.headers["set-cookie"]?.[0]).toContain(
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    );
  });

  it("does not revoke a session when logout has no token", async () => {
    await request(server).post("/auth/logout").expect(201, { ok: true });

    expect(revokeToken).not.toHaveBeenCalled();
  });
});
