import { BadRequestException } from '@nestjs/common';
import type { Conversation, PostDraft } from '@prisma/client';
import { ConversationsService } from './conversations.service';
import type { GenerationService } from '../generation/generation.service';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
} from '../image-generation/image-generation.types';
import type { ImageGenerationService } from '../image-generation/image-generation.service';
import type { PrismaService } from '../prisma/prisma.service';

type DraftConversation = Pick<Conversation, 'topic' | 'userId'>;
type PostDraftWithConversation = PostDraft & {
  conversation: DraftConversation;
};
type SerializedPostDraft = Omit<PostDraft, 'sections' | 'tags'> & {
  sections: string[];
  tags: string[];
};
type PostDraftSerializer = {
  toPostDraft(draft: PostDraft): SerializedPostDraft;
};
type PostDraftFindFirst = (
  args: unknown,
) => Promise<PostDraftWithConversation | null>;
type PostDraftUpdate = (args: unknown) => Promise<PostDraft>;
type GenerateCover = (
  input: ImageGenerationInput,
) => Promise<ImageGenerationResult>;
type PrismaMock = {
  postDraft: {
    findFirst: jest.MockedFunction<PostDraftFindFirst>;
    update: jest.MockedFunction<PostDraftUpdate>;
  };
};

describe('ConversationsService post draft images', () => {
  function createService() {
    const generation = {} as GenerationService;
    const generateCover = jest.fn<GenerateCover>();
    const images = {
      generateCover,
    } as unknown as jest.Mocked<ImageGenerationService>;
    const prisma: PrismaMock = {
      postDraft: {
        findFirst: jest.fn<PostDraftFindFirst>(),
        update: jest.fn<PostDraftUpdate>(),
      },
    };

    const service = new ConversationsService(
      generation,
      images,
      prisma as unknown as PrismaService,
    );
    return { generateCover, prisma, service };
  }

  const baseDraft: PostDraftWithConversation = {
    caption: '正文开场',
    conversation: { topic: '周末备餐', userId: 'user-1' },
    conversationId: 'conversation-1',
    coverLine: '实用攻略 高保存率',
    createdAt: new Date('2026-06-06T00:00:00.000Z'),
    id: 'draft-1',
    imageError: null,
    imageGeneratedAt: null,
    imagePrompt: '竖版封面',
    imageProvider: null,
    imageStatus: 'idle',
    imageUrl: null,
    outlineId: 'outline-1',
    sections: JSON.stringify(['第一段', '第二段']),
    stale: false,
    tags: JSON.stringify(['小红书图文', '备餐']),
    title: '周末备餐也能很好看',
    updatedAt: new Date('2026-06-06T00:01:00.000Z'),
  };

  it('serializes image fields with a post draft', () => {
    const { service } = createService();
    const generatedAt = new Date('2026-06-06T00:02:00.000Z');

    const result = (service as unknown as PostDraftSerializer).toPostDraft({
      ...baseDraft,
      imageGeneratedAt: generatedAt,
      imageProvider: 'rednote-image-model',
      imageStatus: 'ready',
      imageUrl: 'data:image/png;base64,abc',
    });

    expect(result).toMatchObject({
      imageError: null,
      imageGeneratedAt: generatedAt,
      imageProvider: 'rednote-image-model',
      imageStatus: 'ready',
      imageUrl: 'data:image/png;base64,abc',
    });
  });

  it('generates a provider image for an owned post draft', async () => {
    const { generateCover, prisma, service } = createService();
    const generatedAt = new Date('2026-06-06T00:03:00.000Z');
    const imageUrl = 'data:image/png;base64,ready';

    prisma.postDraft.findFirst.mockResolvedValue(baseDraft);
    prisma.postDraft.update
      .mockResolvedValueOnce({
        ...baseDraft,
        imageError: null,
        imagePrompt: '自定义封面',
        imageStatus: 'generating',
      })
      .mockResolvedValueOnce({
        ...baseDraft,
        imageError: null,
        imageGeneratedAt: generatedAt,
        imagePrompt: '自定义封面',
        imageProvider: 'rednote-image-model',
        imageStatus: 'ready',
        imageUrl,
      });
    generateCover.mockResolvedValue({
      generatedAt,
      imageUrl,
      provider: 'rednote-image-model',
    });

    const result = await service.generatePostDraftImage('user-1', 'draft-1', {
      imagePrompt: '  自定义封面  ',
    });

    expect(prisma.postDraft.findFirst).toHaveBeenCalledWith({
      include: { conversation: true },
      where: {
        conversation: { userId: 'user-1' },
        conversationId: undefined,
        id: 'draft-1',
      },
    });
    expect(prisma.postDraft.update).toHaveBeenNthCalledWith(1, {
      data: {
        imageError: null,
        imagePrompt: '自定义封面',
        imageStatus: 'generating',
      },
      where: { id: 'draft-1' },
    });
    expect(generateCover).toHaveBeenCalledWith({
      coverLine: '实用攻略 高保存率',
      imagePrompt: '自定义封面',
      postDraftId: 'draft-1',
      tags: ['小红书图文', '备餐'],
      title: '周末备餐也能很好看',
      topic: '周末备餐',
    });
    expect(result).toMatchObject({
      imageError: null,
      imageGeneratedAt: generatedAt,
      imageProvider: 'rednote-image-model',
      imageStatus: 'ready',
      imageUrl,
    });
  });

  it('does not rewrite imagePrompt when the prompt override is blank', async () => {
    const { generateCover, prisma, service } = createService();
    const generatedAt = new Date('2026-06-06T00:04:00.000Z');
    const imageUrl = 'data:image/png;base64,ready';
    const autosavedPrompt = '自动保存后的封面';

    prisma.postDraft.findFirst.mockResolvedValue(baseDraft);
    prisma.postDraft.update
      .mockResolvedValueOnce({
        ...baseDraft,
        imageError: null,
        imagePrompt: autosavedPrompt,
        imageStatus: 'generating',
      })
      .mockResolvedValueOnce({
        ...baseDraft,
        imageError: null,
        imageGeneratedAt: generatedAt,
        imagePrompt: autosavedPrompt,
        imageProvider: 'rednote-image-model',
        imageStatus: 'ready',
        imageUrl,
      });
    generateCover.mockResolvedValue({
      generatedAt,
      imageUrl,
      provider: 'rednote-image-model',
    });

    await service.generatePostDraftImage('user-1', 'draft-1', {
      imagePrompt: '   ',
    });

    expect(prisma.postDraft.update).toHaveBeenNthCalledWith(1, {
      data: {
        imageError: null,
        imageStatus: 'generating',
      },
      where: { id: 'draft-1' },
    });
    expect(generateCover).toHaveBeenCalledWith(
      expect.objectContaining({
        imagePrompt: autosavedPrompt,
      }),
    );
  });

  it('marks the draft failed when provider generation fails', async () => {
    const { generateCover, prisma, service } = createService();

    prisma.postDraft.findFirst.mockResolvedValue(baseDraft);
    prisma.postDraft.update.mockResolvedValueOnce({
      ...baseDraft,
      imageError: null,
      imageStatus: 'generating',
    });
    generateCover.mockRejectedValue(new Error('provider unavailable'));

    const promise = service.generatePostDraftImage('user-1', 'draft-1', {});

    await expect(promise).rejects.toThrow(BadRequestException);
    await expect(promise).rejects.toThrow('provider unavailable');

    expect(prisma.postDraft.update).toHaveBeenLastCalledWith({
      data: {
        imageError: 'provider unavailable',
        imageGeneratedAt: null,
        imageProvider: null,
        imageStatus: 'failed',
        imageUrl: null,
      },
      where: { id: 'draft-1' },
    });
  });

  it('clears old ready image fields when provider generation fails', async () => {
    const { generateCover, prisma, service } = createService();
    const readyDraft = {
      ...baseDraft,
      imageGeneratedAt: new Date('2026-06-06T00:05:00.000Z'),
      imageProvider: 'rednote-image-model',
      imageStatus: 'ready',
      imageUrl: 'data:image/png;base64,old',
    };

    prisma.postDraft.findFirst.mockResolvedValue(readyDraft);
    prisma.postDraft.update.mockResolvedValueOnce({
      ...readyDraft,
      imageError: null,
      imageStatus: 'generating',
    });
    generateCover.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      service.generatePostDraftImage('user-1', 'draft-1', {}),
    ).rejects.toThrow('provider unavailable');

    expect(prisma.postDraft.update).toHaveBeenLastCalledWith({
      data: {
        imageError: 'provider unavailable',
        imageGeneratedAt: null,
        imageProvider: null,
        imageStatus: 'failed',
        imageUrl: null,
      },
      where: { id: 'draft-1' },
    });
  });
});
