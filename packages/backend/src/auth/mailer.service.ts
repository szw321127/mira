import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";
import { RuntimeSecretsService } from "../admin/runtime-secrets.service.js";

const UNCONFIGURED_MESSAGE = "邮件服务未配置，请联系管理员";

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly runtimeSecrets: RuntimeSecretsService) {}

  async sendVerificationCode(email: string, code: string): Promise<void> {
    const config = await this.runtimeSecrets.getSmtpConfig();
    const complete = Boolean(
      config.host && config.port && config.user && config.password && config.from
    );

    if (!complete) {
      if (process.env.NODE_ENV === "production") {
        throw new ServiceUnavailableException(UNCONFIGURED_MESSAGE);
      }
      this.logger.log(`[Mira] Verification code for ${email}: ${code}`);
      return;
    }

    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: config.password
      }
    });

    await transport.sendMail({
      from: config.from,
      to: email,
      subject: "Mira 登录验证码",
      text: `你的 Mira 登录验证码是 ${code}，10 分钟内有效。`
    });
  }
}
