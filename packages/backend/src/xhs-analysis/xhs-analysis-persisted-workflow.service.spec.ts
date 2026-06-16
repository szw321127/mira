import { XhsAnalysisService } from './xhs-analysis.service';

describe('XhsAnalysisService persisted commercial workflow', () => {
  function createService() {
    const prisma = {
      $transaction: jest.fn((callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
      ),
      conversation: {
        findFirst: jest.fn(() => Promise.resolve({ id: 'conversation-1' })),
        update: jest.fn(() => Promise.resolve({ id: 'conversation-1' })),
      },
      outline: {
        findFirst: jest.fn(() => Promise.resolve({ id: 'outline-1' })),
      },
      postDraft: {
        create: jest.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve({
            ...args.data,
            createdAt: new Date('2026-06-10T00:03:00.000Z'),
            id: 'post-draft-1',
            updatedAt: new Date('2026-06-10T00:03:00.000Z'),
          }),
        ),
        updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
      },
    };
    const service = new XhsAnalysisService(
      {} as never,
      prisma as never,
      {} as never,
      { buildResearchOutlines: jest.fn() } as never,
    );

    return { prisma, service };
  }

  it('persists a Xiaohongshu publish package as a backend post draft', async () => {
    const { prisma, service } = createService();

    const result = await service.buildPersistedCommercialWorkflow(
      {
        conversationId: 'conversation-1',
        idea: '给初入职场女生做低预算通勤穿搭',
        outline: [
          '正式场景用西装裤和针织衫打底',
          '普通上班日用衬衫、半裙和乐福鞋',
          '放松场景保留一件有记忆点的外套',
          '买之前先看版型、面料和复穿率',
        ],
        outlineId: 'outline-1',
        pageCount: 5,
      },
      'user-1',
    );
    const createArgs = prisma.postDraft.create.mock.calls[0]?.[0];

    expect(prisma.outline.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        batch: {
          conversation: { userId: 'user-1' },
          conversationId: 'conversation-1',
        },
        id: 'outline-1',
      },
    });
    expect(prisma.postDraft.updateMany).toHaveBeenCalledWith({
      data: { stale: true },
      where: { conversationId: 'conversation-1' },
    });
    expect(createArgs?.data).toMatchObject({
      conversationId: 'conversation-1',
      imageStatus: 'idle',
      outlineId: 'outline-1',
      stale: false,
    });
    expect(result.draft).toMatchObject({
      conversationId: 'conversation-1',
      id: 'post-draft-1',
      imageStatus: 'idle',
      outlineId: 'outline-1',
    });
    expect(result.draft.sections.length).toBeGreaterThanOrEqual(4);
    expect(result.workflow.publishPackage.pages[0]?.role).toBe('cover');
  });

  it('clears the selected outline when persisting a local research outline', async () => {
    const { prisma, service } = createService();

    await service.buildPersistedCommercialWorkflow(
      {
        conversationId: 'conversation-1',
        idea: '把普通早餐做成适合小红书发布的图文',
        outline: [
          '开头先给一个低成本但有仪式感的结果',
          '中间拆出准备食材和摆盘步骤',
          '结尾给可替换清单和拍照角度',
        ],
        pageCount: 4,
      },
      'user-1',
    );

    expect(prisma.outline.findFirst).not.toHaveBeenCalled();
    expect(prisma.postDraft.create.mock.calls[0]?.[0].data.outlineId).toBeUndefined();
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        selectedOutlineId: null,
      }),
      where: { id: 'conversation-1' },
    });
  });
});
