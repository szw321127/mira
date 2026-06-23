import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module.js";
import { AgentModule } from "./agent/agent.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CacheModule } from "./cache/cache.module.js";
import { ConversationsModule } from "./conversations/conversations.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { ImageWorkspacesModule } from "./image-workspaces/image-workspaces.module.js";

@Module({
  imports: [
    DatabaseModule,
    CacheModule,
    HealthModule,
    AdminModule,
    AuthModule,
    ConversationsModule,
    AgentModule,
    ImageWorkspacesModule
  ]
})
export class AppModule {}
