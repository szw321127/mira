import { Module } from '@nestjs/common';
import { AdminAuditLogsModule } from '../admin-audit-logs/admin-audit-logs.module';
import { AdminApiKeyGuard } from '../admin-security/admin-api-key.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminModelConfigsController } from './admin-model-configs.controller';
import { AdminModelConfigsService } from './admin-model-configs.service';

@Module({
  controllers: [AdminModelConfigsController],
  exports: [AdminModelConfigsService],
  imports: [AdminAuditLogsModule, PrismaModule],
  providers: [AdminApiKeyGuard, AdminModelConfigsService],
})
export class AdminModelConfigsModule {}
