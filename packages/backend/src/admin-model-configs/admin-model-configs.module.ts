import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminAuditLogsModule } from '../admin-audit-logs/admin-audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminModelConfigsController } from './admin-model-configs.controller';
import { AdminModelConfigsService } from './admin-model-configs.service';

@Module({
  controllers: [AdminModelConfigsController],
  exports: [AdminModelConfigsService],
  imports: [AdminAuthModule, AdminAuditLogsModule, PrismaModule],
  providers: [AdminModelConfigsService],
})
export class AdminModelConfigsModule {}
