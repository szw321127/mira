import { Module } from '@nestjs/common';
import { AdminAuditLogsModule } from '../admin-audit-logs/admin-audit-logs.module';
import { AdminApiKeyGuard } from '../admin-security/admin-api-key.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminProjectsController } from './admin-projects.controller';
import { AdminProjectsService } from './admin-projects.service';

@Module({
  controllers: [AdminProjectsController],
  imports: [AdminAuditLogsModule, PrismaModule],
  providers: [AdminApiKeyGuard, AdminProjectsService],
})
export class AdminProjectsModule {}
