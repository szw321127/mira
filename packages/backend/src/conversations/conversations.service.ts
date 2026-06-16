import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Conversation,
  ConversationSnapshot,
  Outline,
  PostDraft,
  Prisma,
  SavedDraft,
  XhsResearchRun,
} from '@prisma/client';
import {
  parseJsonRecord,
  parseStringArray,
  stringifyJson,
} from '../common/json';
import { GenerationService } from '../generation/generation.service';
import type {
  OutlineForDraft,
  OutlineTone,
} from '../generation/generation.types';
import { ImageGenerationService } from '../image-generation/image-generation.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateConversationDto } from './dto/create-conversation.dto';
import type { CreateOutlineBatchDto } from './dto/create-outline-batch.dto';
import type { CreateSavedDraftDto } from './dto/create-saved-draft.dto';
import type { CreateSnapshotDto } from './dto/create-snapshot.dto';
import type { GeneratePostDraftImageDto } from './dto/generate-post-draft-image.dto';
import type { GeneratePostDraftDto } from './dto/generate-post-draft.dto';
import type { UpdateConversationDto } from './dto/update-conversation.dto';
import type { UpdateOutlineDto } from './dto/update-outline.dto';
import type { UpdatePostDraftDto } from './dto/update-post-draft.dto';
import type { BackendPostDraftView } from './conversations.types';

const outlineBatchInclude = {
  outlines: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.OutlineBatchInclude;

const conversationInclude = {
  outlineBatches: {
    include: outlineBatchInclude,
    orderBy: { batchNo: 'desc' as const },
  },
  postDrafts: {
    orderBy: { updatedAt: 'desc' as const },
    take: 1,
  },
  savedDrafts: {
    orderBy: { createdAt: 'desc' as const },
    take: 8,
  },
  researchRuns: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
  snapshots: {
    orderBy: { createdAt: 'desc' as const },
    take: 8,
  },
} satisfies Prisma.ConversationInclude;

const postDraftInclude = {
  conversation: true,
} satisfies Prisma.PostDraftInclude;

type OutlineBatchWithOutlines = Prisma.OutlineBatchGetPayload<{
  include: typeof outlineBatchInclude;
}>;

type ConversationAggregate = Prisma.ConversationGetPayload<{
  include: typeof conversationInclude;
}>;

type PostDraftWithConversation = Prisma.PostDraftGetPayload<{
  include: typeof postDraftInclude;
}>;

function parseStringArrayFromRecord(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly generation: GenerationService,
    private readonly images: ImageGenerationService,
    private readonly prisma: PrismaService,
  ) {}

  async list(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      include: {
        _count: {
          select: {
            outlineBatches: true,
            postDrafts: true,
            savedDrafts: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      where: { userId },
    });

    return conversations.map((conversation) => ({
      createdAt: conversation.createdAt,
      id: conversation.id,
      lastOpenedAt: conversation.lastOpenedAt,
      outlineBatchCount: conversation._count.outlineBatches,
      postDraftCount: conversation._count.postDrafts,
      savedDraftCount: conversation._count.savedDrafts,
      selectedOutlineId: conversation.selectedOutlineId,
      statusMessage: conversation.statusMessage,
      title: conversation.title,
      topic: conversation.topic,
      updatedAt: conversation.updatedAt,
    }));
  }

  async create(userId: string, dto: CreateConversationDto) {
    const topic = dto.topic.trim();
    const conversation = await this.prisma.conversation.create({
      data: {
        statusMessage: '会话已创建，可以生成第一批大纲。',
        title: this.createTitle(dto.title, topic),
        topic,
        userId,
      },
    });

    return this.get(userId, conversation.id);
  }

  async get(userId: string, conversationId: string) {
    await this.ensureOwnedConversation(userId, conversationId);
    await this.prisma.conversation.update({
      data: { lastOpenedAt: new Date() },
      where: { id: conversationId },
    });

    const conversation = await this.findAggregate(userId, conversationId);
    return this.toConversation(conversation);
  }

  async update(
    userId: string,
    conversationId: string,
    dto: UpdateConversationDto,
  ) {
    await this.ensureOwnedConversation(userId, conversationId);

    const data: Prisma.ConversationUpdateInput = {};

    if (dto.selectedOutlineId !== undefined) {
      const selectedOutlineId = dto.selectedOutlineId.trim();

      if (selectedOutlineId) {
        await this.findOwnedOutline(userId, selectedOutlineId, conversationId);
        data.selectedOutlineId = selectedOutlineId;
      } else {
        data.selectedOutlineId = null;
      }
    }

    if (dto.statusMessage !== undefined) {
      data.statusMessage = dto.statusMessage;
    }

    if (dto.title !== undefined) {
      data.title = dto.title.trim();
    }

    if (dto.topic !== undefined) {
      data.topic = dto.topic.trim();
    }

    await this.prisma.conversation.update({
      data,
      where: { id: conversationId },
    });

    return this.get(userId, conversationId);
  }

  async remove(userId: string, conversationId: string) {
    await this.ensureOwnedConversation(userId, conversationId);
    await this.prisma.conversation.delete({ where: { id: conversationId } });

    return { ok: true };
  }

  async createOutlineBatch(
    userId: string,
    conversationId: string,
    dto: CreateOutlineBatchDto,
  ) {
    const conversation = await this.ensureOwnedConversation(
      userId,
      conversationId,
    );
    const prompt = dto.prompt?.trim() || conversation.topic;
    const latestBatch = await this.prisma.outlineBatch.findFirst({
      orderBy: { batchNo: 'desc' },
      where: { conversationId },
    });
    const batchNo = (latestBatch?.batchNo ?? -1) + 1;
    const generatedOutlines = await this.generation.createOutlines(
      prompt,
      batchNo,
    );

    const batch = await this.prisma.outlineBatch.create({
      data: {
        batchNo,
        conversationId,
        outlines: {
          create: generatedOutlines.map((outline, position) => ({
            hook: outline.hook,
            label: outline.label,
            points: stringifyJson(outline.points),
            position,
            title: outline.title,
            tone: outline.tone,
          })),
        },
        prompt,
      },
      include: outlineBatchInclude,
    });
    const firstOutlineId = batch.outlines[0]?.id;

    await this.prisma.postDraft.updateMany({
      data: { stale: true },
      where: { conversationId },
    });
    await this.prisma.conversation.update({
      data: {
        selectedOutlineId: firstOutlineId,
        statusMessage: '已追加新一批大纲，之前生成的仍保留。',
        title: this.createTitle(undefined, prompt),
        topic: prompt,
      },
      where: { id: conversationId },
    });

    return {
      batch: this.toOutlineBatch(batch),
      conversation: await this.get(userId, conversationId),
    };
  }

  async updateOutline(
    userId: string,
    outlineId: string,
    dto: UpdateOutlineDto,
  ) {
    const outline = await this.findOwnedOutline(userId, outlineId);
    const data: Prisma.OutlineUpdateInput = {};

    if (dto.hook !== undefined) data.hook = dto.hook;
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.tone !== undefined) data.tone = dto.tone;

    if (dto.points !== undefined) {
      const points = dto.points.map((point) => point.trim()).filter(Boolean);

      if (!points.length) {
        throw new BadRequestException('Outline points cannot be empty.');
      }

      data.points = stringifyJson(points);
    }

    const updated = await this.prisma.outline.update({
      data,
      where: { id: outlineId },
    });

    await this.prisma.postDraft.updateMany({
      data: { stale: true },
      where: { conversationId: outline.batch.conversationId },
    });

    return this.toOutline(updated);
  }

  async generatePostDraft(
    userId: string,
    conversationId: string,
    dto: GeneratePostDraftDto,
  ) {
    const conversation = await this.ensureOwnedConversation(
      userId,
      conversationId,
    );
    const outlineId = dto.outlineId ?? conversation.selectedOutlineId;

    if (!outlineId) {
      throw new BadRequestException('Select an outline before generating.');
    }

    const outline = await this.findOwnedOutline(
      userId,
      outlineId,
      conversationId,
    );

    await this.prisma.postDraft.updateMany({
      data: { stale: true },
      where: { conversationId },
    });

    const generated = await this.generation.createPostDraft(
      conversation.topic,
      this.toOutlineForDraft(outline),
    );
    const draft = await this.prisma.postDraft.create({
      data: {
        caption: generated.caption,
        conversationId,
        coverLine: generated.coverLine,
        imageError: null,
        imageGeneratedAt: null,
        imagePrompt: generated.imagePrompt,
        imageProvider: null,
        imageStatus: 'idle',
        imageUrl: null,
        outlineId,
        sections: stringifyJson(generated.sections),
        stale: false,
        tags: stringifyJson(generated.tags),
        title: generated.title,
      },
    });

    await this.prisma.conversation.update({
      data: {
        selectedOutlineId: outlineId,
        statusMessage: '图文草稿已生成，可以复制或继续微调大纲。',
      },
      where: { id: conversationId },
    });

    return this.toPostDraft(draft);
  }

  async getPostDraft(userId: string, postDraftId: string) {
    const draft = await this.findOwnedPostDraft(userId, postDraftId);
    return this.toPostDraft(draft);
  }

  async generatePostDraftImage(
    userId: string,
    postDraftId: string,
    dto: GeneratePostDraftImageDto,
  ) {
    const draft = await this.findOwnedPostDraft(userId, postDraftId);
    const imagePromptOverride = dto.imagePrompt?.trim();
    const generatingData: Prisma.PostDraftUpdateInput = {
      imageError: null,
      imageStatus: 'generating',
    };

    if (imagePromptOverride) {
      generatingData.imagePrompt = imagePromptOverride;
    }

    const generatingDraft = await this.prisma.postDraft.update({
      data: generatingData,
      where: { id: postDraftId },
    });
    const imagePrompt = imagePromptOverride || generatingDraft.imagePrompt;

    try {
      const result = await this.images.generateCover({
        coverLine: draft.coverLine,
        imagePrompt,
        postDraftId: draft.id,
        tags: parseStringArray(draft.tags),
        title: draft.title,
        topic: draft.conversation.topic,
      });
      const updated = await this.prisma.postDraft.update({
        data: {
          imageError: null,
          imageGeneratedAt: result.generatedAt,
          imageProvider: result.provider,
          imageStatus: 'ready',
          imageUrl: result.imageUrl,
        },
        where: { id: postDraftId },
      });

      return this.toPostDraft(updated);
    } catch (error) {
      const imageError = this.toErrorMessage(error);

      await this.prisma.postDraft.update({
        data: {
          imageError,
          imageGeneratedAt: null,
          imageProvider: null,
          imageStatus: 'failed',
          imageUrl: null,
        },
        where: { id: postDraftId },
      });

      throw new BadRequestException(imageError);
    }
  }

  async updatePostDraft(
    userId: string,
    postDraftId: string,
    dto: UpdatePostDraftDto,
  ) {
    await this.findOwnedPostDraft(userId, postDraftId);

    const data: Prisma.PostDraftUpdateInput = {};

    if (dto.caption !== undefined) data.caption = dto.caption;
    if (dto.coverLine !== undefined) data.coverLine = dto.coverLine;
    if (dto.imagePrompt !== undefined) data.imagePrompt = dto.imagePrompt;
    if (dto.sections !== undefined) data.sections = stringifyJson(dto.sections);
    if (dto.tags !== undefined) data.tags = stringifyJson(dto.tags);
    if (dto.title !== undefined) data.title = dto.title;

    const updated = await this.prisma.postDraft.update({
      data,
      where: { id: postDraftId },
    });

    return this.toPostDraft(updated);
  }

  async createSavedDraft(
    userId: string,
    conversationId: string,
    dto: CreateSavedDraftDto,
  ) {
    await this.ensureOwnedConversation(userId, conversationId);
    const draft = dto.postDraftId
      ? await this.findOwnedPostDraft(userId, dto.postDraftId, conversationId)
      : dto.snapshot
        ? null
        : await this.prisma.postDraft.findFirst({
            orderBy: { updatedAt: 'desc' },
            where: { conversationId },
          });
    const snapshot = dto.snapshot ?? (draft ? this.toPostDraft(draft) : null);

    if (!snapshot) {
      throw new BadRequestException('A saved draft needs a draft or snapshot.');
    }

    const savedDraft = await this.prisma.savedDraft.create({
      data: {
        conversationId,
        postDraftId: draft?.id,
        snapshot: stringifyJson(snapshot),
      },
    });

    return this.toSavedDraft(savedDraft);
  }

  async listSavedDrafts(userId: string, conversationId: string) {
    await this.ensureOwnedConversation(userId, conversationId);

    const savedDrafts = await this.prisma.savedDraft.findMany({
      orderBy: { createdAt: 'desc' },
      where: { conversationId },
    });

    return savedDrafts.map((savedDraft) => this.toSavedDraft(savedDraft));
  }

  async createSnapshot(
    userId: string,
    conversationId: string,
    dto: CreateSnapshotDto,
  ) {
    await this.ensureOwnedConversation(userId, conversationId);

    const snapshot = await this.prisma.conversationSnapshot.create({
      data: {
        conversationId,
        snapshot: stringifyJson(dto.snapshot),
      },
    });

    return this.toSnapshot(snapshot);
  }

  async listSnapshots(userId: string, conversationId: string) {
    await this.ensureOwnedConversation(userId, conversationId);

    const snapshots = await this.prisma.conversationSnapshot.findMany({
      orderBy: { createdAt: 'desc' },
      where: { conversationId },
    });

    return snapshots.map((snapshot) => this.toSnapshot(snapshot));
  }

  async restoreSnapshot(userId: string, snapshotId: string) {
    const snapshot = await this.prisma.conversationSnapshot.findFirst({
      include: { conversation: true },
      where: {
        id: snapshotId,
        conversation: { userId },
      },
    });

    if (!snapshot) {
      throw new NotFoundException('Snapshot not found.');
    }

    await this.prisma.conversation.update({
      data: { lastOpenedAt: new Date() },
      where: { id: snapshot.conversationId },
    });

    return this.toSnapshot(snapshot);
  }

  private async ensureOwnedConversation(
    userId: string,
    conversationId: string,
  ): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    return conversation;
  }

  private async findAggregate(
    userId: string,
    conversationId: string,
  ): Promise<ConversationAggregate> {
    const conversation = await this.prisma.conversation.findFirst({
      include: conversationInclude,
      where: { id: conversationId, userId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    return conversation;
  }

  private async findOwnedOutline(
    userId: string,
    outlineId: string,
    conversationId?: string,
  ) {
    const outline = await this.prisma.outline.findFirst({
      include: {
        batch: true,
      },
      where: {
        batch: {
          conversationId,
          conversation: {
            userId,
          },
        },
        id: outlineId,
      },
    });

    if (!outline) {
      throw new NotFoundException('Outline not found.');
    }

    return outline;
  }

  private async findOwnedPostDraft(
    userId: string,
    postDraftId: string,
    conversationId?: string,
  ): Promise<PostDraftWithConversation> {
    const draft = await this.prisma.postDraft.findFirst({
      include: postDraftInclude,
      where: {
        conversationId,
        conversation: { userId },
        id: postDraftId,
      },
    });

    if (!draft) {
      throw new NotFoundException('Post draft not found.');
    }

    return draft;
  }

  private createTitle(title: string | undefined, topic: string): string {
    const normalizedTitle = title?.trim();
    if (normalizedTitle) return normalizedTitle;
    return topic.trim().slice(0, 24) || '未命名创作';
  }

  private toConversation(conversation: ConversationAggregate) {
    return {
      createdAt: conversation.createdAt,
      currentPostDraft:
        conversation.postDrafts.length > 0
          ? this.toPostDraft(conversation.postDrafts[0])
          : null,
      id: conversation.id,
      lastOpenedAt: conversation.lastOpenedAt,
      latestResearchRun:
        conversation.researchRuns.length > 0
          ? this.toXhsResearchRun(conversation.researchRuns[0])
          : null,
      outlineBatches: conversation.outlineBatches.map((batch) =>
        this.toOutlineBatch(batch),
      ),
      savedDrafts: conversation.savedDrafts.map((draft) =>
        this.toSavedDraft(draft),
      ),
      selectedOutlineId: conversation.selectedOutlineId,
      snapshots: conversation.snapshots.map((snapshot) =>
        this.toSnapshot(snapshot),
      ),
      statusMessage: conversation.statusMessage,
      title: conversation.title,
      topic: conversation.topic,
      updatedAt: conversation.updatedAt,
    };
  }

  private toOutlineBatch(batch: OutlineBatchWithOutlines) {
    return {
      batchNo: batch.batchNo,
      conversationId: batch.conversationId,
      createdAt: batch.createdAt,
      id: batch.id,
      outlines: batch.outlines.map((outline) => this.toOutline(outline)),
      prompt: batch.prompt,
    };
  }

  private toOutline(outline: Outline) {
    return {
      batchId: outline.batchId,
      createdAt: outline.createdAt,
      hook: outline.hook,
      id: outline.id,
      label: outline.label,
      points: parseStringArray(outline.points),
      position: outline.position,
      title: outline.title,
      tone: outline.tone,
      updatedAt: outline.updatedAt,
    };
  }

  private toPostDraft(draft: PostDraft): BackendPostDraftView {
    return {
      caption: draft.caption,
      conversationId: draft.conversationId,
      coverLine: draft.coverLine,
      createdAt: draft.createdAt,
      id: draft.id,
      imageError: draft.imageError,
      imageGeneratedAt: draft.imageGeneratedAt,
      imageProvider: draft.imageProvider,
      imagePrompt: draft.imagePrompt,
      imageStatus: draft.imageStatus,
      imageUrl: draft.imageUrl,
      outlineId: draft.outlineId,
      sections: parseStringArray(draft.sections),
      stale: draft.stale,
      tags: parseStringArray(draft.tags),
      title: draft.title,
      updatedAt: draft.updatedAt,
    };
  }

  private toSavedDraft(savedDraft: SavedDraft) {
    return {
      conversationId: savedDraft.conversationId,
      createdAt: savedDraft.createdAt,
      id: savedDraft.id,
      postDraftId: savedDraft.postDraftId,
      snapshot: parseJsonRecord(savedDraft.snapshot),
    };
  }

  private toSnapshot(snapshot: ConversationSnapshot) {
    return {
      conversationId: snapshot.conversationId,
      createdAt: snapshot.createdAt,
      id: snapshot.id,
      snapshot: parseJsonRecord(snapshot.snapshot),
    };
  }

  private toXhsResearchRun(run: XhsResearchRun) {
    const analysis = parseJsonRecord(run.analysis);

    return {
      confidence:
        analysis.confidence === 'high' ||
        analysis.confidence === 'medium' ||
        analysis.confidence === 'low'
          ? analysis.confidence
          : 'low',
      createdAt: run.createdAt,
      failedKeywords: parseStringArrayFromRecord(analysis.failedKeywords),
      id: run.id,
      idea: run.idea,
      keywords: parseStringArray(run.keywords),
      mode: run.mode === 'deep' ? 'deep' : 'quick',
      providerEndpoint: run.providerEndpoint,
      providerType: this.toXhsResearchProviderType(run.providerType),
      sampleCount: run.sampleCount,
      status:
        typeof analysis.status === 'string' ? analysis.status : run.status,
      summary: parseJsonRecord(run.summary),
      warnings: parseStringArrayFromRecord(analysis.warnings),
    };
  }

  private toOutlineForDraft(
    outline: Outline & { batch: { conversationId: string } },
  ): OutlineForDraft {
    return {
      hook: outline.hook,
      id: outline.id,
      label: outline.label,
      points: parseStringArray(outline.points),
      title: outline.title,
      tone: this.toOutlineTone(outline.tone),
    };
  }

  private toXhsResearchProviderType(value: string) {
    if (value === 'xhs_connector') return 'xhs_connector';
    if (value === 'none') return 'none';
    return value === 'tikhub' ? 'tikhub' : 'custom';
  }

  private toOutlineTone(tone: string): OutlineTone {
    if (tone === 'checklist' || tone === 'guide' || tone === 'story') {
      return tone;
    }

    return 'guide';
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'Image generation failed.';
  }
}
