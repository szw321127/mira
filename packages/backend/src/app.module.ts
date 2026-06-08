import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminAuditLogsModule } from './admin-audit-logs/admin-audit-logs.module';
import { AdminModelConfigsModule } from './admin-model-configs/admin-model-configs.module';
import { AdminProjectsModule } from './admin-projects/admin-projects.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConversationsModule } from './conversations/conversations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env', '../../.env'],
      isGlobal: true,
    }),
    AdminAuditLogsModule,
    AdminModelConfigsModule,
    AdminProjectsModule,
    AuthModule,
    ConversationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
