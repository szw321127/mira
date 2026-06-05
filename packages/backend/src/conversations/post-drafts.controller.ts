import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ConversationsService } from './conversations.service';
import { GeneratePostDraftImageDto } from './dto/generate-post-draft-image.dto';
import { UpdatePostDraftDto } from './dto/update-post-draft.dto';

@Controller('post-drafts')
@UseGuards(JwtAuthGuard)
export class PostDraftsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.conversationsService.getPostDraft(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePostDraftDto,
  ) {
    return this.conversationsService.updatePostDraft(user.id, id, dto);
  }

  @Post(':id/image')
  generateImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GeneratePostDraftImageDto,
  ) {
    return this.conversationsService.generatePostDraftImage(user.id, id, dto);
  }
}
