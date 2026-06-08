import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin-security/admin-api-key.guard';
import { AdminModelConfigsService } from './admin-model-configs.service';
import { UpdateAdminModelConfigDto } from './dto/update-admin-model-config.dto';

@Controller('admin/model-configs')
@UseGuards(AdminApiKeyGuard)
export class AdminModelConfigsController {
  constructor(
    private readonly adminModelConfigsService: AdminModelConfigsService,
  ) {}

  @Get()
  list() {
    return this.adminModelConfigsService.list();
  }

  @Put(':type')
  save(@Param('type') type: string, @Body() dto: UpdateAdminModelConfigDto) {
    return this.adminModelConfigsService.save(type, dto);
  }

  @Post(':type/test')
  testConnection(@Param('type') type: string) {
    return this.adminModelConfigsService.testConnection(type);
  }
}
