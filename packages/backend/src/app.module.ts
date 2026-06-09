import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { AdminAuditLogsModule } from './admin-audit-logs/admin-audit-logs.module';
import { AdminModelConfigsModule } from './admin-model-configs/admin-model-configs.module';
import { AdminContentProvidersModule } from './admin-content-providers/admin-content-providers.module';
import { AdminProjectsModule } from './admin-projects/admin-projects.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConversationsModule } from './conversations/conversations.module';
import { XhsAnalysisModule } from './xhs-analysis/xhs-analysis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env', '../../.env'],
      isGlobal: true,
    }),
    AdminAuthModule,
    AdminAuditLogsModule,
    AdminModelConfigsModule,
    AdminContentProvidersModule,
    AdminProjectsModule,
    AuthModule,
    ConversationsModule,
    XhsAnalysisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
