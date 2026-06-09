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
import { AdminContentProvidersService } from './admin-content-providers.service';
import { CreateAdminContentProviderApiKeyDto } from './dto/create-admin-content-provider-api-key.dto';
import { UpdateAdminContentProviderApiKeyDto } from './dto/update-admin-content-provider-api-key.dto';
import { UpdateAdminContentProviderDto } from './dto/update-admin-content-provider.dto';

@Controller('admin/content-providers')
@UseGuards(AdminJwtAuthGuard)
export class AdminContentProvidersController {
  constructor(
    private readonly adminContentProvidersService: AdminContentProvidersService,
  ) {}

  @Get()
  list() {
    return this.adminContentProvidersService.list();
  }

  @Put(':type')
  save(
    @Param('type') type: string,
    @Body() dto: UpdateAdminContentProviderDto,
  ) {
    return this.adminContentProvidersService.save(type, dto);
  }

  @Post(':type/api-keys')
  addApiKey(
    @Param('type') type: string,
    @Body() dto: CreateAdminContentProviderApiKeyDto,
  ) {
    return this.adminContentProvidersService.addApiKey(type, dto);
  }

  @Patch(':type/api-keys/:keyId')
  updateApiKey(
    @Param('type') type: string,
    @Param('keyId') keyId: string,
    @Body() dto: UpdateAdminContentProviderApiKeyDto,
  ) {
    return this.adminContentProvidersService.updateApiKey(type, keyId, dto);
  }

  @Delete(':type/api-keys/:keyId')
  deleteApiKey(@Param('type') type: string, @Param('keyId') keyId: string) {
    return this.adminContentProvidersService.deleteApiKey(type, keyId);
  }
}
