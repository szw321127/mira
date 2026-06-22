import { jest } from "@jest/globals";
import { Logger, ServiceUnavailableException } from "@nestjs/common";
import type { RuntimeSecretsService } from "../admin/runtime-secrets.service.js";

const sendMail = jest.fn(() => Promise.resolve());
const createTransport = jest.fn(() => ({ sendMail }));

jest.unstable_mockModule("nodemailer", () => ({
  default: {
    createTransport
  }
}));

const { MailerService } = await import("./mailer.service.js");

type SmtpConfig = Awaited<ReturnType<RuntimeSecretsService["getSmtpConfig"]>>;

function createRuntimeSecrets(config: SmtpConfig) {
  return {
    getSmtpConfig: jest.fn(() => Promise.resolve(config))
  } as unknown as RuntimeSecretsService;
}

function incompleteConfig(): SmtpConfig {
  return {
    host: "",
    port: 0,
    user: "",
    password: "",
    from: ""
  };
}

function completeConfig(port = 465): SmtpConfig {
  return {
    host: "smtp.example.com",
    port,
    user: "smtp-user",
    password: "smtp-password",
    from: "Mira <noreply@example.com>"
  };
}

describe("MailerService", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let loggerSpy: jest.SpiedFunction<typeof Logger.prototype.log>;

  beforeEach(() => {
    createTransport.mockClear();
    sendMail.mockClear();
    loggerSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    loggerSpy.mockRestore();
  });

  it("logs verification codes in development when SMTP is incomplete", async () => {
    process.env.NODE_ENV = "development";
    const service = new MailerService(createRuntimeSecrets(incompleteConfig()));

    await expect(
      service.sendVerificationCode("user@example.com", "123456")
    ).resolves.toBeUndefined();

    expect(loggerSpy).toHaveBeenCalledWith(
      "[Mira] Verification code for user@example.com: 123456"
    );
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("rejects production sends when SMTP is incomplete", async () => {
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
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("sends verification emails with configured SMTP", async () => {
    process.env.NODE_ENV = "production";
    const service = new MailerService(createRuntimeSecrets(completeConfig(465)));

    await expect(
      service.sendVerificationCode("user@example.com", "123456")
    ).resolves.toBeUndefined();

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      auth: {
        user: "smtp-user",
        pass: "smtp-password"
      }
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "Mira <noreply@example.com>",
      to: "user@example.com",
      subject: "Mira 登录验证码",
      text: "你的 Mira 登录验证码是 123456，10 分钟内有效。"
    });
  });
});
