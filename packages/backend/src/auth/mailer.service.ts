import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { Resend } from "resend";
import { RuntimeSecretsService } from "../admin/runtime-secrets.service.js";

const UNCONFIGURED_MESSAGE = "邮件服务未配置，请联系管理员";
const SEND_FAILED_MESSAGE = "验证码邮件发送失败，请稍后再试";

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly runtimeSecrets: RuntimeSecretsService) {}

  async ensureCanSendVerificationCode(): Promise<void> {
    const config = await this.runtimeSecrets.getResendConfig();
    if (isResendConfigComplete(config) || process.env.NODE_ENV !== "production") {
      return;
    }
    throw new ServiceUnavailableException(UNCONFIGURED_MESSAGE);
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    const config = await this.runtimeSecrets.getResendConfig();

    if (!isResendConfigComplete(config)) {
      if (process.env.NODE_ENV === "production") {
        throw new ServiceUnavailableException(UNCONFIGURED_MESSAGE);
      }
      this.logger.log(`[Mira] Verification code for ${email}: ${code}`);
      return;
    }

    const resend = new Resend(config.apiKey);
    let result: Awaited<ReturnType<typeof resend.emails.send>>;
    try {
      result = await resend.emails.send({
        from: config.from,
        to: [email],
        subject: "Mira 登录验证码",
        text: `你的 Mira 登录验证码是 ${code}，10 分钟内有效。`
      });
    } catch (error) {
      this.logger.warn(
        `Resend verification email request failed: ${formatUnknownError(error)}`
      );
      throw new ServiceUnavailableException(SEND_FAILED_MESSAGE);
    }

    if (result.error) {
      this.logger.warn(
        `Resend verification email failed: ${formatResendError(result.error)}`
      );
      throw new ServiceUnavailableException(SEND_FAILED_MESSAGE);
    }
  }
}

function isResendConfigComplete(config: {
  apiKey: string;
  from: string;
}): boolean {
  return Boolean(config.apiKey && config.from);
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function formatResendError(error: {
  message?: string;
  name?: string;
  statusCode?: number | null;
}): string {
  return [error.statusCode, error.name, error.message]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .join(" ");
}
