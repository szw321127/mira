import { jest } from "@jest/globals";
import { Logger, ServiceUnavailableException } from "@nestjs/common";
import type { RuntimeSecretsService } from "../admin/runtime-secrets.service.js";

const fetchMock = jest.fn<typeof fetch>();

const { MailerService } = await import("./mailer.service.js");

type ResendConfig = Awaited<ReturnType<RuntimeSecretsService["getResendConfig"]>>;

function createRuntimeSecrets(config: ResendConfig) {
  return {
    getResendConfig: jest.fn(() => Promise.resolve(config))
  } as unknown as RuntimeSecretsService;
}

function incompleteConfig(): ResendConfig {
  return {
    apiKey: "",
    from: ""
  };
}

function completeConfig(): ResendConfig {
  return {
    apiKey: "re_test_123",
    from: "Mira <noreply@example.com>"
  };
}

describe("MailerService", () => {
  const originalFetch = globalThis.fetch;
  const originalNodeEnv = process.env.NODE_ENV;
  let loggerSpy: jest.SpiedFunction<typeof Logger.prototype.log>;
  let warnSpy: jest.SpiedFunction<typeof Logger.prototype.warn>;

  beforeEach(() => {
    globalThis.fetch = fetchMock;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "email_123" }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      })
    );
    loggerSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.NODE_ENV = originalNodeEnv;
    loggerSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("logs verification codes in development when Resend is incomplete", async () => {
    process.env.NODE_ENV = "development";
    const service = new MailerService(createRuntimeSecrets(incompleteConfig()));

    await expect(
      service.sendVerificationCode("user@example.com", "123456")
    ).resolves.toBeUndefined();

    expect(loggerSpy).toHaveBeenCalledWith(
      "[Mira] Verification code for user@example.com: 123456"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects production sends when Resend is incomplete", async () => {
    process.env.NODE_ENV = "production";
    const service = new MailerService(createRuntimeSecrets(incompleteConfig()));

    await expect(
      service.sendVerificationCode("user@example.com", "123456")
    ).rejects.toThrow(
      new ServiceUnavailableException("邮件服务未配置，请联系管理员")
    );
    await expect(service.ensureCanSendVerificationCode()).rejects.toThrow(
      new ServiceUnavailableException("邮件服务未配置，请联系管理员")
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends verification emails with configured Resend", async () => {
    process.env.NODE_ENV = "production";
    const service = new MailerService(createRuntimeSecrets(completeConfig()));

    await expect(
      service.sendVerificationCode("user@example.com", "123456")
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer re_test_123",
        "Content-Type": "application/json",
        "User-Agent": "Mira/1.0"
      },
      body: JSON.stringify({
        from: "Mira <noreply@example.com>",
        to: ["user@example.com"],
        subject: "Mira 登录验证码",
        text: "你的 Mira 登录验证码是 123456，10 分钟内有效。"
      })
    });
  });

  it("treats non-2xx Resend responses as send failures", async () => {
    process.env.NODE_ENV = "production";
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "domain is not verified" }), {
        status: 422
      })
    );
    const service = new MailerService(createRuntimeSecrets(completeConfig()));

    await expect(
      service.sendVerificationCode("user@example.com", "123456")
    ).rejects.toThrow("验证码邮件发送失败，请稍后再试");
  });

  it("wraps Resend request errors as send failures", async () => {
    process.env.NODE_ENV = "production";
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const service = new MailerService(createRuntimeSecrets(completeConfig()));

    await expect(
      service.sendVerificationCode("user@example.com", "123456")
    ).rejects.toThrow("验证码邮件发送失败，请稍后再试");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("network down")
    );
  });
});
