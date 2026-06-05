import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ConversationsService } from './conversations.service';
import { UpdateOutlineDto } from './dto/update-outline.dto';

@Controller('outlines')
@UseGuards(JwtAuthGuard)
export class OutlinesController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOutlineDto,
  ) {
    return this.conversationsService.updateOutline(user.id, id, dto);
  }
}
