import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { AdminAuditLogsService } from './admin-audit-logs.service';

@Module({
  controllers: [AdminAuditLogsController],
  exports: [AdminAuditLogsService],
  imports: [PrismaModule],
  providers: [AdminAuditLogsService],
})
export class AdminAuditLogsModule {}
