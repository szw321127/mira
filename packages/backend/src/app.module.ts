import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module.js";
import { AgentModule } from "./agent/agent.module.js";

@Module({
  imports: [AdminModule, AgentModule]
})
export class AppModule {}
