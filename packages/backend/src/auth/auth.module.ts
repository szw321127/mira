import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AuthService } from "./auth.service.js";
import { EmailCodeService } from "./email-code.service.js";
import { MailerService } from "./mailer.service.js";
import { UserSessionService } from "./user-session.service.js";

@Module({
  imports: [DatabaseModule, AdminModule],
  providers: [AuthService, EmailCodeService, MailerService, UserSessionService],
  exports: [UserSessionService]
})
export class AuthModule {}
