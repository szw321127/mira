import type { INestApplication } from "@nestjs/common";
import { jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { UserSessionService } from "./user-session.service.js";

describe("AuthController", () => {
  const originalTrustProxyHeaders = process.env.TRUST_PROXY_HEADERS;
  let app: INestApplication;
  let server: Server;
  const requestCode = jest.fn();
  const requestBindEmailCode = jest.fn();
  const login = jest.fn();
  const registerWithPassword = jest.fn();
  const loginWithPassword = jest.fn();
  const bindEmail = jest.fn();
  const requireUser = jest.fn();
  const revokeToken = jest.fn();

  beforeEach(async () => {
    delete process.env.TRUST_PROXY_HEADERS;
    requestCode.mockReset();
    requestBindEmailCode.mockReset();
    login.mockReset();
    registerWithPassword.mockReset();
    loginWithPassword.mockReset();
    bindEmail.mockReset();
    requireUser.mockReset();
    revokeToken.mockReset();

    requestCode.mockResolvedValue({ ok: true });
    requestBindEmailCode.mockResolvedValue({ ok: true });
    login.mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        username: null,
        status: "enabled"
      },
      token: "session-token"
    });
    registerWithPassword.mockResolvedValue({
      user: {
        id: "user-1",
        email: null,
        username: "mirauser",
        status: "enabled"
      },
      token: "session-token"
    });
    loginWithPassword.mockResolvedValue({
      user: {
        id: "user-1",
        email: null,
        username: "mirauser",
        status: "enabled"
      },
      token: "session-token"
    });
    bindEmail.mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        username: "mirauser",
        status: "enabled"
      }
    });
    requireUser.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      username: null,
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
            requestBindEmailCode,
            login,
            registerWithPassword,
            loginWithPassword,
            bindEmail
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
    if (originalTrustProxyHeaders === undefined) {
      delete process.env.TRUST_PROXY_HEADERS;
    } else {
      process.env.TRUST_PROXY_HEADERS = originalTrustProxyHeaders;
    }
  });

  it("normalizes valid code requests and uses the direct request IP by default", async () => {
    await request(server)
      .post("/auth/code")
      .set("x-forwarded-for", "203.0.113.10, 198.51.100.20")
      .send({ email: " User@Example.COM " })
      .expect(200, { ok: true });

    expect(requestCode).toHaveBeenCalledWith(
      "user@example.com",
      expect.not.stringMatching(/^203\.0\.113\.10$/)
    );
  });

  it("trusts forwarded request IP only when proxy headers are enabled", async () => {
    process.env.TRUST_PROXY_HEADERS = "true";

    await request(server)
      .post("/auth/code")
      .set("x-forwarded-for", "203.0.113.10, 198.51.100.20")
      .send({ email: " User@Example.COM " })
      .expect(200, { ok: true });

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
      .expect(200);

    expect(response.body).toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        username: null,
        status: "enabled"
      }
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

  it("registers a password account and sets the user session cookie", async () => {
    const response = await request(server)
      .post("/auth/password/register")
      .send({ username: " MiraUser ", password: "strong-pass-123" })
      .expect(200);

    expect(response.body).toEqual({
      user: {
        id: "user-1",
        email: null,
        username: "mirauser",
        status: "enabled"
      }
    });
    expect(registerWithPassword).toHaveBeenCalledWith(
      "mirauser",
      "strong-pass-123"
    );
    expect(response.headers["set-cookie"]?.[0]).toContain("mira_user_session=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });

  it("logs in with a password account identifier", async () => {
    const response = await request(server)
      .post("/auth/password/login")
      .send({ identifier: " MiraUser ", password: "strong-pass-123" })
      .expect(200);

    expect(response.body).toEqual({
      user: {
        id: "user-1",
        email: null,
        username: "mirauser",
        status: "enabled"
      }
    });
    expect(loginWithPassword).toHaveBeenCalledWith(
      "mirauser",
      "strong-pass-123"
    );
    expect(response.headers["set-cookie"]?.[0]).toContain("mira_user_session=");
  });

  it("rejects invalid password auth requests", async () => {
    await request(server)
      .post("/auth/password/register")
      .send({ username: "a", password: "short" })
      .expect(400);

    await request(server)
      .post("/auth/password/login")
      .send({ identifier: "", password: "" })
      .expect(400);

    expect(registerWithPassword).not.toHaveBeenCalled();
    expect(loginWithPassword).not.toHaveBeenCalled();
  });

  it("requests a bind-email code for the current user", async () => {
    await request(server)
      .post("/auth/email/bind/code")
      .set("Cookie", "mira_user_session=session-token")
      .send({ email: " User@Example.COM " })
      .expect(200, { ok: true });

    expect(requireUser).toHaveBeenCalledWith("session-token");
    expect(requestBindEmailCode).toHaveBeenCalledWith(
      "user@example.com",
      expect.any(String)
    );
  });

  it("binds a verified email to the current session user", async () => {
    const response = await request(server)
      .post("/auth/email/bind")
      .set("Cookie", "mira_user_session=session-token")
      .send({ email: " User@Example.COM ", code: "123456" })
      .expect(200);

    expect(response.body).toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        username: "mirauser",
        status: "enabled"
      }
    });
    expect(requireUser).toHaveBeenCalledWith("session-token");
    expect(bindEmail).toHaveBeenCalledWith(
      "user-1",
      "user@example.com",
      "123456"
    );
  });

  it("returns the current user from the session cookie", async () => {
    const response = await request(server)
      .get("/auth/session")
      .set("Cookie", "mira_user_session=session-token")
      .expect(200);

    expect(response.body).toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        username: null,
        status: "enabled"
      }
    });
    expect(requireUser).toHaveBeenCalledWith("session-token");
  });

  it("revokes the session token and clears the cookie on logout", async () => {
    const response = await request(server)
      .post("/auth/logout")
      .set("Cookie", "mira_user_session=session-token")
      .expect(200, { ok: true });

    expect(revokeToken).toHaveBeenCalledWith("session-token");
    expect(response.headers["set-cookie"]?.[0]).toContain("mira_user_session=");
    expect(response.headers["set-cookie"]?.[0]).toContain(
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    );
  });

  it("does not revoke a session when logout has no token", async () => {
    await request(server).post("/auth/logout").expect(200, { ok: true });

    expect(revokeToken).not.toHaveBeenCalled();
  });

  it("clears the cookie even when session revocation fails", async () => {
    revokeToken.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await request(server)
      .post("/auth/logout")
      .set("Cookie", "mira_user_session=session-token")
      .expect(500);

    expect(response.headers["set-cookie"]?.[0]).toContain("mira_user_session=");
    expect(response.headers["set-cookie"]?.[0]).toContain(
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    );
  });
});
