import { Controller, Get, Query } from '@nestjs/common';
import { AdminAuditLogsService } from './admin-audit-logs.service';

@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly auditLogs: AdminAuditLogsService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.auditLogs.list(limit ? Number(limit) : undefined);
  }
}
