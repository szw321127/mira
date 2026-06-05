import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GenerationModule } from '../generation/generation.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { OutlinesController } from './outlines.controller';
import { PostDraftsController } from './post-drafts.controller';
import { SnapshotsController } from './snapshots.controller';

@Module({
  controllers: [
    ConversationsController,
    OutlinesController,
    PostDraftsController,
    SnapshotsController,
  ],
  imports: [AuthModule, GenerationModule, PrismaModule],
  providers: [ConversationsService],
})
export class ConversationsModule {}
