import { Module } from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin-security/admin-api-key.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { AdminAuditLogsService } from './admin-audit-logs.service';

@Module({
  controllers: [AdminAuditLogsController],
  exports: [AdminAuditLogsService],
  imports: [PrismaModule],
  providers: [AdminApiKeyGuard, AdminAuditLogsService],
})
export class AdminAuditLogsModule {}
