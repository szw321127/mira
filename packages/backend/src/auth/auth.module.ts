import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { EmailCodeService } from "./email-code.service.js";
import { MailerService } from "./mailer.service.js";
import { UserSessionService } from "./user-session.service.js";

@Module({
  imports: [DatabaseModule, AdminModule],
  controllers: [AuthController],
  providers: [AuthService, EmailCodeService, MailerService, UserSessionService],
  exports: [UserSessionService]
})
export class AuthModule {}
