import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';
import { CurrentAdmin } from './current-admin.decorator';
import type { AuthenticatedAdmin } from './admin-auth.types';
import { AdminLoginDto } from './dto/admin-login.dto';
import { ChangeAdminPasswordDto } from './dto/change-admin-password.dto';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto);
  }

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  getMe(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.adminAuthService.getMe(admin.id);
  }

  @Patch('profile')
  @UseGuards(AdminJwtAuthGuard)
  updateProfile(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: UpdateAdminProfileDto,
  ) {
    return this.adminAuthService.updateProfile(admin.id, dto);
  }

  @Patch('password')
  @UseGuards(AdminJwtAuthGuard)
  changePassword(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: ChangeAdminPasswordDto,
  ) {
    return this.adminAuthService.changePassword(admin.id, dto);
  }
}
