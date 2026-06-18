import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { AdminStore } from "./admin-store.js";
import { RuntimeSecretsService } from "./runtime-secrets.service.js";
import { DatabaseModule } from "../database/database.module.js";

@Module({
  imports: [DatabaseModule],
  controllers: [AdminController],
  providers: [AdminService, AdminStore, RuntimeSecretsService],
  exports: [RuntimeSecretsService]
})
export class AdminModule {}
