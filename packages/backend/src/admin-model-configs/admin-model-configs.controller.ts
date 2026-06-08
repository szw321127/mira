import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { AdminModelConfigsService } from './admin-model-configs.service';
import { UpdateAdminModelConfigDto } from './dto/update-admin-model-config.dto';

@Controller('admin/model-configs')
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
}
