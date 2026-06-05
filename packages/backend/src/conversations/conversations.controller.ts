import {
  Body,
  Controller,
  Delete,
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
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateOutlineBatchDto } from './dto/create-outline-batch.dto';
import { CreateSavedDraftDto } from './dto/create-saved-draft.dto';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';
import { GeneratePostDraftDto } from './dto/generate-post-draft.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.conversationsService.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationsService.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.conversationsService.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.conversationsService.remove(user.id, id);
  }

  @Post(':id/outline-batches')
  createOutlineBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateOutlineBatchDto,
  ) {
    return this.conversationsService.createOutlineBatch(user.id, id, dto);
  }

  @Post(':id/post-draft')
  generatePostDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GeneratePostDraftDto,
  ) {
    return this.conversationsService.generatePostDraft(user.id, id, dto);
  }

  @Post(':id/saved-drafts')
  createSavedDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateSavedDraftDto,
  ) {
    return this.conversationsService.createSavedDraft(user.id, id, dto);
  }

  @Get(':id/saved-drafts')
  listSavedDrafts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.conversationsService.listSavedDrafts(user.id, id);
  }

  @Post(':id/snapshots')
  createSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateSnapshotDto,
  ) {
    return this.conversationsService.createSnapshot(user.id, id, dto);
  }

  @Get(':id/snapshots')
  listSnapshots(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.conversationsService.listSnapshots(user.id, id);
  }
}
