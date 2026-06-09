import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { AdminAuditLogsService } from './admin-audit-logs.service';

@Module({
  controllers: [AdminAuditLogsController],
  exports: [AdminAuditLogsService],
  imports: [AdminAuthModule, PrismaModule],
  providers: [AdminAuditLogsService],
})
export class AdminAuditLogsModule {}
