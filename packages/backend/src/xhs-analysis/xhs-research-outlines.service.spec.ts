import { BadRequestException } from '@nestjs/common';
import { XhsResearchOutlinesService } from './xhs-research-outlines.service';

const authorization = {
  accountId: 'xhs-user-1',
  accountName: '小红书作者',
  avatarUrl: null,
  cookie: 'a1=abc; web_session=session;',
  createdAt: new Date('2026-06-15T00:00:00.000Z'),
  id: 'xhs-auth-1',
  lastValidatedAt: new Date('2026-06-15T00:00:00.000Z'),
  platform: 'xhs' as const,
  status: 'active' as const,
  subType: 'pc' as const,
  updatedAt: new Date('2026-06-15T00:00:00.000Z'),
};

const authorizations = {
  getActiveRuntimeAuthorization: jest.fn(() => Promise.resolve(authorization)),
};

const connector = {
  searchPosts: jest.fn(() =>
    Promise.resolve([
      {
        collected_count: '1.2万',
        comment_count: 280,
        content: '原始正文不会返回到前端摘要。',
        liked_count: '2.1万',
        note_id: 'note-a',
        tag_list: ['通勤穿搭', '低预算'],
        title: '普通女生也能复制的 12 件通勤衣橱',
        url: 'https://www.xiaohongshu.com/explore/note-a',
      },
    ]),
  ),
};

const prisma = {
  $transaction: jest.fn((callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  ),
  conversation: {
    findFirst: jest.fn(() => Promise.resolve({ id: 'conversation-1' })),
    update: jest.fn(() => Promise.resolve({ id: 'conversation-1' })),
  },
  outlineBatch: {
    create: jest.fn((args: { data: Record<string, any> }) =>
      Promise.resolve({
        batchNo: args.data.batchNo,
        conversationId: args.data.conversationId,
        createdAt: new Date('2026-06-15T00:01:00.000Z'),
        id: 'outline-batch-1',
        outlines: (args.data.outlines.create as Array<Record<string, any>>).map(
          (outline, index) => ({
            ...outline,
            batchId: 'outline-batch-1',
            createdAt: new Date('2026-06-15T00:01:00.000Z'),
            id: `outline-${index + 1}`,
            updatedAt: new Date('2026-06-15T00:01:00.000Z'),
          }),
        ),
        prompt: args.data.prompt,
      }),
    ),
    findFirst: jest.fn(() => Promise.resolve(null)),
  },
  postDraft: {
    updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
  },
  xhsResearchRun: {
    create: jest.fn((args: { data: Record<string, any> }) =>
      Promise.resolve({
        ...args.data,
        createdAt: new Date('2026-06-15T00:00:00.000Z'),
        id: 'research-run-1',
        updatedAt: new Date('2026-06-15T00:00:00.000Z'),
      }),
    ),
  },
};

const researchAi = {
  generateResearchOutlines: jest.fn(
    async ({ analysis }: { analysis: Record<string, unknown> }) => ({
      analysis,
      outlines: [
        {
          hook: 'AI 认为痛点切入更适合这批样本。',
          label: '痛点切入',
          points: ['P1 先讲乱买痛点', 'P2 给低预算清单', 'P3 做避坑复盘'],
          title: 'AI 生成：初入职场低预算通勤衣橱',
          tone: 'story',
        },
        {
          hook: 'AI 认为步骤结构降低执行门槛。',
          label: '步骤教程',
          points: ['P1 定场景', 'P2 定颜色', 'P3 定单品'],
          title: 'AI 生成：低预算通勤穿搭三步走',
          tone: 'guide',
        },
        {
          hook: 'AI 认为清单结构更适合收藏。',
          label: '收藏清单',
          points: ['P1 必备项', 'P2 可选项', 'P3 避坑项'],
          title: 'AI 生成：通勤衣橱收藏清单',
          tone: 'checklist',
        },
      ],
    }),
  ),
};

describe('XhsResearchOutlinesService', () => {
  let service: XhsResearchOutlinesService;

  beforeEach(() => {
    jest.restoreAllMocks();
    authorizations.getActiveRuntimeAuthorization.mockClear();
    authorizations.getActiveRuntimeAuthorization.mockResolvedValue(authorization);
    connector.searchPosts.mockClear();
    connector.searchPosts.mockResolvedValue([
      {
        collected_count: '1.2万',
        comment_count: 280,
        content: '原始正文不会返回到前端摘要。',
        liked_count: '2.1万',
        note_id: 'note-a',
        tag_list: ['通勤穿搭', '低预算'],
        title: '普通女生也能复制的 12 件通勤衣橱',
        url: 'https://www.xiaohongshu.com/explore/note-a',
      },
    ]);
    prisma.$transaction.mockClear();
    prisma.conversation.findFirst.mockClear();
    prisma.conversation.update.mockClear();
    prisma.outlineBatch.create.mockClear();
    prisma.outlineBatch.findFirst.mockClear();
    prisma.postDraft.updateMany.mockClear();
    prisma.xhsResearchRun.create.mockClear();
    researchAi.generateResearchOutlines.mockClear();
    service = new XhsResearchOutlinesService(
      prisma as never,
      researchAi as never,
      authorizations as never,
      connector as never,
    );
  });

  it('searches with the user authorization and creates AI research-backed outlines', async () => {
    const result = await service.buildResearchOutlines(
      {
        conversationId: 'conversation-1',
        idea: '给初入职场女生做低预算通勤穿搭',
        mode: 'quick',
      },
      'user-1',
    );

    expect(authorizations.getActiveRuntimeAuthorization).toHaveBeenCalledWith(
      'user-1',
    );
    expect(connector.searchPosts).toHaveBeenCalledWith({
      authorizationId: 'xhs-auth-1',
      cookie: 'a1=abc; web_session=session;',
      keyword: expect.any(String),
      limit: 5,
      sort: 'popular',
    });
    expect(result.research.providerType).toBe('xhs_connector');
    expect(result.research.providerEndpoint).toBeNull();
    expect(result.research.sampleCount).toBeGreaterThanOrEqual(1);
    expect(result.research.summary.standoutSamples[0]).toMatchObject({
      sourceId: 'note-a',
      title: '普通女生也能复制的 12 件通勤衣橱',
    });
    expect(
      JSON.stringify(result.research.summary.standoutSamples),
    ).not.toContain('原始正文');
    expect(researchAi.generateResearchOutlines).toHaveBeenCalledWith(
      expect.objectContaining({
        idea: '给初入职场女生做低预算通勤穿搭',
        samples: expect.arrayContaining([
          expect.objectContaining({ sourceId: 'note-a' }),
        ]),
      }),
    );
    expect(result.batch.outlines[0]).toMatchObject({
      hook: 'AI 认为痛点切入更适合这批样本。',
      label: '痛点切入',
      title: 'AI 生成：初入职场低预算通勤衣橱',
      tone: 'story',
    });
  });

  it('continues with editable low-confidence outlines when samples are sparse', async () => {
    connector.searchPosts.mockResolvedValue([
      {
        collected_count: 12,
        comment_count: 1,
        liked_count: 43,
        note_id: 'note-small',
        tag_list: ['早餐'],
        title: '新手早餐记录',
      },
    ]);

    const result = await service.buildResearchOutlines(
      {
        conversationId: 'conversation-1',
        idea: '新手做小红书早餐内容',
        mode: 'quick',
      },
      'user-1',
    );

    expect(result.research.confidence).toBe('low');
    expect(result.research.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('样本较少')]),
    );
    expect(result.batch.outlines).toHaveLength(3);
  });

  it('returns fallback outlines for a valid empty connector result', async () => {
    connector.searchPosts.mockResolvedValue([]);

    const result = await service.buildResearchOutlines(
      {
        conversationId: 'conversation-1',
        idea: '新手做小红书早餐内容',
        mode: 'quick',
      },
      'user-1',
    );

    expect(result.research.status).toBe('fallback_no_samples');
    expect(result.research.confidence).toBe('low');
    expect(result.batch.outlines).toHaveLength(3);
  });

  it('requires a user Xiaohongshu authorization before research', async () => {
    authorizations.getActiveRuntimeAuthorization.mockRejectedValueOnce(
      new BadRequestException('请先授权小红书账号，再生成爆款研究大纲。'),
    );

    await expect(
      service.buildResearchOutlines(
        {
          conversationId: 'conversation-1',
          idea: '新手做小红书早餐内容',
          mode: 'quick',
        },
        'user-1',
      ),
    ).rejects.toThrow('请先授权小红书账号');
    expect(connector.searchPosts).not.toHaveBeenCalled();
  });

  it('records partial keyword failures while still returning outlines', async () => {
    connector.searchPosts
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue([
        {
          collected_count: '8200',
          comment_count: 120,
          liked_count: '1.8万',
          note_id: 'note-ok',
          tag_list: ['通勤穿搭'],
          title: '初入职场第一套通勤衣橱',
        },
      ]);

    const result = await service.buildResearchOutlines(
      {
        conversationId: 'conversation-1',
        idea: '给初入职场女生做低预算通勤穿搭',
        mode: 'quick',
      },
      'user-1',
    );

    expect(connector.searchPosts).toHaveBeenCalled();
    expect(result.research.failedKeywords.length).toBeGreaterThanOrEqual(1);
    expect(result.research.status).toBe('completed_with_warning');
    expect(result.batch.outlines).toHaveLength(3);
  });
});
