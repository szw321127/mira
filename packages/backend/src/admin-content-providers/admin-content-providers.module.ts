import { Module } from '@nestjs/common';
import { AdminAuditLogsModule } from '../admin-audit-logs/admin-audit-logs.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminContentProvidersController } from './admin-content-providers.controller';
import { AdminContentProvidersService } from './admin-content-providers.service';

@Module({
  controllers: [AdminContentProvidersController],
  exports: [AdminContentProvidersService],
  imports: [AdminAuthModule, AdminAuditLogsModule, PrismaModule],
  providers: [AdminContentProvidersService],
})
export class AdminContentProvidersModule {}
