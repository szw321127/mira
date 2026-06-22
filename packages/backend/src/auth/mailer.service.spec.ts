import { jest } from "@jest/globals";
import { Logger, ServiceUnavailableException } from "@nestjs/common";
import type { RuntimeSecretsService } from "../admin/runtime-secrets.service.js";

type ResendEmailPayload = {
  from: string;
  to: string[];
  subject?: string;
  text?: string;
  template?: {
    id: string;
    variables: Record<string, string | number>;
  };
};

type ResendSendResult =
  | {
      data: { id: string };
      error: null;
      headers: null;
    }
  | {
      data: null;
      error: {
        message: string;
        name: string;
        statusCode: number | null;
      };
      headers: null;
    };

const sendMock =
  jest.fn<(payload: ResendEmailPayload) => Promise<ResendSendResult>>();
const ResendMock = jest.fn(() => ({
  emails: {
    send: sendMock
  }
}));

jest.unstable_mockModule("resend", () => ({
  Resend: ResendMock
}));

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
    from: "",
    templateId: "",
    templateCodeVariable: ""
  };
}

function completeConfig(): ResendConfig {
  return {
    apiKey: "re_test_123",
    from: "Mira <noreply@example.com>",
    templateId: "",
    templateCodeVariable: ""
  };
}

function completeTemplateConfig(): ResendConfig {
  return {
    ...completeConfig(),
    templateId: "tmpl_login_code",
    templateCodeVariable: "verificationCode"
  };
}

describe("MailerService", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let loggerSpy: jest.SpiedFunction<typeof Logger.prototype.log>;
  let warnSpy: jest.SpiedFunction<typeof Logger.prototype.warn>;

  beforeEach(() => {
    ResendMock.mockClear();
    sendMock.mockReset();
    sendMock.mockResolvedValue({
      data: { id: "email_123" },
      error: null,
      headers: null
    });
    loggerSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
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
    expect(ResendMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
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
    expect(ResendMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends verification emails with configured Resend", async () => {
    process.env.NODE_ENV = "production";
    const service = new MailerService(createRuntimeSecrets(completeConfig()));

    await expect(
      service.sendVerificationCode("user@example.com", "123456")
    ).resolves.toBeUndefined();

    expect(ResendMock).toHaveBeenCalledWith("re_test_123");
    expect(sendMock).toHaveBeenCalledWith({
      from: "Mira <noreply@example.com>",
      to: ["user@example.com"],
      subject: "Mira 登录验证码",
      text: "你的 Mira 登录验证码是 123456，10 分钟内有效。"
    });
  });

  it("sends verification emails through a configured Resend template", async () => {
    process.env.NODE_ENV = "production";
    const service = new MailerService(
      createRuntimeSecrets(completeTemplateConfig())
    );

    await expect(
      service.sendVerificationCode("user@example.com", "123456")
    ).resolves.toBeUndefined();

    expect(sendMock).toHaveBeenCalledWith({
      from: "Mira <noreply@example.com>",
      to: ["user@example.com"],
      subject: "Mira 登录验证码",
      template: {
        id: "tmpl_login_code",
        variables: {
          verificationCode: "123456"
        }
      }
    });
    expect(sendMock.mock.calls[0]?.[0]).not.toHaveProperty("text");
  });

  it("defaults the Resend template code variable to CODE", async () => {
    process.env.NODE_ENV = "production";
    const service = new MailerService(
      createRuntimeSecrets({
        ...completeConfig(),
        templateId: "tmpl_login_code",
        templateCodeVariable: ""
      })
    );

    await expect(
      service.sendVerificationCode("user@example.com", "123456")
    ).resolves.toBeUndefined();

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        template: {
          id: "tmpl_login_code",
          variables: {
            CODE: "123456"
          }
        }
      })
    );
  });

  it("treats Resend SDK errors as send failures", async () => {
    process.env.NODE_ENV = "production";
    sendMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "domain is not verified",
        name: "validation_error",
        statusCode: 422
      },
      headers: null
    });
    const service = new MailerService(createRuntimeSecrets(completeConfig()));

    await expect(
      service.sendVerificationCode("user@example.com", "123456")
    ).rejects.toThrow("验证码邮件发送失败，请稍后再试");
  });

  it("wraps Resend request errors as send failures", async () => {
    process.env.NODE_ENV = "production";
    sendMock.mockRejectedValueOnce(new Error("network down"));
    const service = new MailerService(createRuntimeSecrets(completeConfig()));

    await expect(
      service.sendVerificationCode("user@example.com", "123456")
    ).rejects.toThrow("验证码邮件发送失败，请稍后再试");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("network down")
    );
  });
});
