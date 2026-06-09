import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminAuditLogsModule } from '../admin-audit-logs/admin-audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminProjectsController } from './admin-projects.controller';
import { AdminProjectsService } from './admin-projects.service';

@Module({
  controllers: [AdminProjectsController],
  imports: [AdminAuthModule, AdminAuditLogsModule, PrismaModule],
  providers: [AdminProjectsService],
})
export class AdminProjectsModule {}
