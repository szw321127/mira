import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { AdminStore } from "./admin-store.js";

@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminStore]
})
export class AdminModule {}
