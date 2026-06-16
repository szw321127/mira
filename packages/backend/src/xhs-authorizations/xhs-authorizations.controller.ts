import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateXhsAuthorizationDto } from './dto/create-xhs-authorization.dto';
import { XhsAuthorizationsService } from './xhs-authorizations.service';

@Controller('xhs-authorizations')
@UseGuards(JwtAuthGuard)
export class XhsAuthorizationsController {
  constructor(private readonly authorizations: XhsAuthorizationsService) {}

  @Post()
  createOrReplace(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateXhsAuthorizationDto,
  ) {
    return this.authorizations.createOrReplace(user.id, dto);
  }

  @Get('current')
  getCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.authorizations.getCurrent(user.id);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.authorizations.delete(user.id, id);
  }
}
