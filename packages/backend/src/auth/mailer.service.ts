import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { RuntimeSecretsService } from "../admin/runtime-secrets.service.js";

const UNCONFIGURED_MESSAGE = "邮件服务未配置，请联系管理员";
const SEND_FAILED_MESSAGE = "验证码邮件发送失败，请稍后再试";
const RESEND_EMAILS_URL = "https://api.resend.com/emails";

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

    let response: Response;
    try {
      response = await fetch(RESEND_EMAILS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "Mira/1.0"
        },
        body: JSON.stringify({
          from: config.from,
          to: [email],
          subject: "Mira 登录验证码",
          text: `你的 Mira 登录验证码是 ${code}，10 分钟内有效。`
        })
      });
    } catch (error) {
      this.logger.warn(
        `Resend verification email request failed: ${formatUnknownError(error)}`
      );
      throw new ServiceUnavailableException(SEND_FAILED_MESSAGE);
    }

    if (!response.ok) {
      this.logger.warn(
        `Resend verification email failed: ${response.status} ${await readResponseBody(response)}`
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

async function readResponseBody(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  return body.slice(0, 500);
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
