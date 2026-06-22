import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AgentController } from "./agent.controller.js";
import { AgentService } from "./agent.service.js";

@Module({
  imports: [AdminModule, AuthModule],
  controllers: [AgentController],
  providers: [AgentService]
})
export class AgentModule {}
