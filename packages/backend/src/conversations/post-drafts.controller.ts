import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ConversationsService } from './conversations.service';
import { UpdatePostDraftDto } from './dto/update-post-draft.dto';

@Controller('post-drafts')
@UseGuards(JwtAuthGuard)
export class PostDraftsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePostDraftDto,
  ) {
    return this.conversationsService.updatePostDraft(user.id, id, dto);
  }
}
