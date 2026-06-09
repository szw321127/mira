import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminModelConfigsService } from './admin-model-configs.service';
import { CreateAdminModelApiKeyDto } from './dto/create-admin-model-api-key.dto';
import { UpdateAdminModelApiKeyDto } from './dto/update-admin-model-api-key.dto';
import { UpdateAdminModelConfigDto } from './dto/update-admin-model-config.dto';

@Controller('admin/model-configs')
@UseGuards(AdminJwtAuthGuard)
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

  @Post(':type/api-keys')
  addApiKey(
    @Param('type') type: string,
    @Body() dto: CreateAdminModelApiKeyDto,
  ) {
    return this.adminModelConfigsService.addApiKey(type, dto);
  }

  @Patch(':type/api-keys/:keyId')
  updateApiKey(
    @Param('type') type: string,
    @Param('keyId') keyId: string,
    @Body() dto: UpdateAdminModelApiKeyDto,
  ) {
    return this.adminModelConfigsService.updateApiKey(type, keyId, dto);
  }

  @Delete(':type/api-keys/:keyId')
  deleteApiKey(@Param('type') type: string, @Param('keyId') keyId: string) {
    return this.adminModelConfigsService.deleteApiKey(type, keyId);
  }
}
