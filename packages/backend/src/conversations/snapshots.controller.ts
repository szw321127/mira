import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ConversationsService } from './conversations.service';

@Controller('snapshots')
@UseGuards(JwtAuthGuard)
export class SnapshotsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.conversationsService.restoreSnapshot(user.id, id);
  }
}
