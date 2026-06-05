import { BadRequestException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import type { GenerationService } from '../generation/generation.service';
import type { ImageGenerationService } from '../image-generation/image-generation.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('ConversationsService post draft images', () => {
  function createService() {
    const generation = {} as GenerationService;
    const images = {
      generateCover: jest.fn(),
    } as unknown as jest.Mocked<ImageGenerationService>;
    const prisma = {
      postDraft: { findFirst: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService;

    const service = new ConversationsService(generation, images, prisma);
    return { images, prisma: prisma as any, service };
  }

  const baseDraft = {
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

    const result = (service as any).toPostDraft({
      ...baseDraft,
      imageGeneratedAt: generatedAt,
      imageProvider: 'mock',
      imageStatus: 'ready',
      imageUrl: 'data:image/svg+xml;base64,abc',
    });

    expect(result).toMatchObject({
      imageError: null,
      imageGeneratedAt: generatedAt,
      imageProvider: 'mock',
      imageStatus: 'ready',
      imageUrl: 'data:image/svg+xml;base64,abc',
    });
  });

  it('generates a mock image for an owned post draft', async () => {
    const { images, prisma, service } = createService();
    const generatedAt = new Date('2026-06-06T00:03:00.000Z');
    const imageUrl = 'data:image/svg+xml;base64,ready';

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
        imageProvider: 'mock',
        imageStatus: 'ready',
        imageUrl,
      });
    images.generateCover.mockResolvedValue({
      generatedAt,
      imageUrl,
      provider: 'mock',
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
    expect(images.generateCover).toHaveBeenCalledWith({
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
      imageProvider: 'mock',
      imageStatus: 'ready',
      imageUrl,
    });
  });

  it('marks the draft failed when provider generation fails', async () => {
    const { images, prisma, service } = createService();

    prisma.postDraft.findFirst.mockResolvedValue(baseDraft);
    prisma.postDraft.update.mockResolvedValueOnce({
      ...baseDraft,
      imageError: null,
      imageStatus: 'generating',
    });
    images.generateCover.mockRejectedValue(new Error('provider unavailable'));

    const promise = service.generatePostDraftImage('user-1', 'draft-1', {});

    await expect(promise).rejects.toThrow(BadRequestException);
    await expect(promise).rejects.toThrow('provider unavailable');

    expect(prisma.postDraft.update).toHaveBeenLastCalledWith({
      data: {
        imageError: 'provider unavailable',
        imageStatus: 'failed',
      },
      where: { id: 'draft-1' },
    });
  });
});
