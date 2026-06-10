import { XhsAnalysisService } from './xhs-analysis.service';

const contentProviders = {
  getRuntimeConfig: jest.fn(() =>
    Promise.resolve({
      apiKey: 'provider-key',
      baseUrl: 'https://provider.example',
      complianceNote: 'Only use authorized imports.',
      enabled: true,
      rateLimitPerMinute: 60,
      type: 'custom' as const,
    }),
  ),
};

type XhsReferenceUpsertArgs = {
  create: {
    analysis: string;
    conversationId: string;
    imported: string;
    kind: string;
    sourceId: string;
    title: string;
  };
  where: {
    conversationId_kind_sourceId: {
      conversationId: string;
      kind: string;
      sourceId: string;
    };
  };
};

const storedPostReference = {
  analysis: JSON.stringify({
    engagement: { total: 24928 },
    post: { title: '通勤包这样收纳，早八少慌 10 分钟' },
    tagPatterns: ['通勤包'],
    viralSignals: ['高收藏价值'],
  }),
  conversationId: 'conversation-1',
  createdAt: new Date('2026-06-10T00:00:00.000Z'),
  id: 'xhs-reference-post-1',
  imported: JSON.stringify({
    posts: [{ title: '通勤包这样收纳，早八少慌 10 分钟' }],
    sources: [{ normalizedId: 'note-42', source: 'provider' }],
  }),
  kind: 'post',
  providerEndpoint: 'https://provider.example/xhs/posts/import',
  providerType: 'custom',
  sourceId: 'note-42',
  sourceUrl: 'https://www.xiaohongshu.com/explore/note-42',
  title: '通勤包这样收纳，早八少慌 10 分钟',
  updatedAt: new Date('2026-06-10T00:02:00.000Z'),
};

const storedPostReferenceOwnership = {
  conversation: { userId: 'user-1' },
  id: 'xhs-reference-post-1',
};

const prisma = {
  conversation: {
    findFirst: jest.fn(() => Promise.resolve({ id: 'conversation-1' })),
  },
  xhsReference: {
    delete: jest.fn(() => Promise.resolve(storedPostReference)),
    findFirst: jest.fn(() => Promise.resolve(storedPostReferenceOwnership)),
    findMany: jest.fn(() => Promise.resolve([storedPostReference])),
    upsert: jest.fn((args: XhsReferenceUpsertArgs) => {
      const { create } = args;

      return Promise.resolve({
        conversationId: create.conversationId,
        createdAt: new Date('2026-06-10T00:00:00.000Z'),
        id: 'xhs-reference-1',
        kind: create.kind,
        sourceId: create.sourceId,
        title: create.title,
      });
    }),
  },
};

describe('XhsAnalysisService', () => {
  let service: XhsAnalysisService;

  beforeEach(() => {
    jest.restoreAllMocks();
    contentProviders.getRuntimeConfig.mockClear();
    prisma.conversation.findFirst.mockClear();
    prisma.xhsReference.delete.mockClear();
    prisma.xhsReference.findFirst.mockClear();
    prisma.xhsReference.findMany.mockClear();
    prisma.xhsReference.upsert.mockClear();
    service = new XhsAnalysisService(
      contentProviders as never,
      prisma as never,
    );
  });

  it('analyzes a Xiaohongshu post with normalized engagement signals', () => {
    const result = service.analyzePost({
      title: '普通女生也能复制的通勤胶囊衣橱',
      content:
        '我用 12 件单品搭了 21 套通勤 look，省钱是真的，早上不用纠结也是真的。',
      images: [
        'https://example.com/cover.jpg',
        'https://example.com/page-2.jpg',
      ],
      metrics: {
        collects: '1.1万',
        comments: 342,
        likes: '2.4万',
        shares: 840,
      },
      tags: ['通勤穿搭', '胶囊衣橱', '普通女生'],
    });

    expect(result.format).toBe('image-text');
    expect(result.engagement.total).toBe(36182);
    expect(result.viralSignals).toEqual(
      expect.arrayContaining(['高收藏价值', '数字化清单结构']),
    );
  });

  it('analyzes an imported account and exposes top content pillars', () => {
    const result = service.analyzeAccount({
      bio: '小个子通勤穿搭，每周更新胶囊衣橱',
      followers: '8.6万',
      name: '阿鱼的衣橱',
      posts: [
        {
          title: '小个子通勤裤子这样买',
          content: '版型、长度、面料三个维度，照着买不踩雷。',
          metrics: { collects: '9800', comments: 310, likes: '1.2万' },
          tags: ['小个子穿搭', '通勤穿搭'],
        },
        {
          title: '12 件单品搭出一周通勤',
          content: '把颜色控制在三类，重复穿也不会被看出来。',
          metrics: { collects: '7200', comments: 128, likes: '6800' },
          tags: ['胶囊衣橱', '通勤穿搭'],
        },
      ],
    });

    expect(result.snapshot.followers).toBe(86000);
    expect(result.contentPillars[0]).toMatchObject({
      count: 2,
      name: '通勤穿搭',
    });
  });

  it('builds three editable outline candidates for the creator workbench', () => {
    const candidates = service.buildOutlineCandidates({
      audience: '初入职场女生',
      idea: '给初入职场女生做低预算通勤穿搭',
    });

    expect(candidates).toHaveLength(3);
    expect(candidates.map((candidate) => candidate.strategy)).toEqual([
      'pain-point',
      'step-by-step',
      'checklist',
    ]);
    expect(candidates.every((candidate) => candidate.outline.length >= 4)).toBe(
      true,
    );
  });

  it('builds a commercial workflow from imported references and a selected outline', () => {
    const workflow = service.buildCommercialWorkflow({
      account: {
        raw: {
          desc: '小个子通勤穿搭，每周更新胶囊衣橱',
          fans: '8.6万',
          nickname: '阿鱼的衣橱',
          notes: [
            {
              collected_count: '9800',
              comment_count: 310,
              desc: '版型、长度、面料三个维度，照着买不踩雷。',
              liked_count: '1.2万',
              note_id: 'note-1',
              tag_list: ['小个子穿搭', '通勤穿搭'],
              title: '小个子通勤裤子这样买',
            },
          ],
        },
        source: 'provider',
        sourceId: 'provider-user-1',
      },
      audience: '初入职场女生',
      idea: '给初入职场女生做低预算通勤穿搭',
      outline: [
        '正式场景用西装裤和针织衫打底',
        '普通上班日用衬衫、半裙和乐福鞋',
        '放松场景保留一件有记忆点的外套',
        '买之前先看版型、面料和复穿率',
      ],
      pageCount: 5,
    });

    expect(workflow.accountAnalysis?.snapshot.followers).toBe(86000);
    expect(workflow.publishPackage.pages[0]?.role).toBe('cover');
    expect(workflow.audit.ready).toBe(true);
    expect(workflow.summary).toMatchObject({
      ready: true,
      referenceCount: 1,
      score: workflow.audit.score,
    });
  });

  it('builds a generation brief from analyzed account and post references', () => {
    const account = service.analyzeAccount({
      bio: '通勤效率和包内收纳，每周更新真实清单',
      followers: '4.2万',
      name: '早八不慌实验室',
      posts: [
        {
          title: '通勤包这样收纳，早八少慌 10 分钟',
          content: '把通勤包里的东西拆成三个模块，早上直接照着拿。',
          metrics: { collects: '8800', comments: 128, likes: '1.6万' },
          tags: ['通勤包', '效率工具'],
        },
      ],
    });
    const reference = service.analyzePost({
      title: '普通女生也能复制的通勤胶囊衣橱',
      content:
        '我用 12 件单品搭了 21 套通勤 look，省钱是真的，早上不用纠结也是真的。',
      images: ['https://example.com/cover.jpg'],
      metrics: {
        collects: '1.1万',
        comments: 342,
        likes: '2.4万',
        shares: 840,
      },
      tags: ['通勤穿搭', '胶囊衣橱', '普通女生'],
    });

    const brief = service.buildGenerationBrief({
      account,
      idea: '给初入职场女生做低预算通勤穿搭',
      references: [reference],
    });

    expect(brief.idea).toBe('给初入职场女生做低预算通勤穿搭');
    expect(brief.sourcePatterns).toEqual(
      expect.arrayContaining(['高收藏价值', '数字化清单结构']),
    );
    expect(brief.promptAdditions.join('\n')).toContain('小红书图文成稿');
    expect(brief.recommendedSections.length).toBeGreaterThanOrEqual(3);
  });

  it('imports a post from the configured provider before analyzing it', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({
          data: {
            collected_count: '8800',
            comment_count: 128,
            desc: '把通勤包里的东西拆成三个模块，早上直接照着拿。',
            image_list: ['https://example.com/cover.jpg'],
            liked_count: '1.6万',
            note_id: 'note-42',
            tag_list: ['通勤包', '效率工具'],
            title: '通勤包这样收纳，早八少慌 10 分钟',
          },
        }),
      ok: true,
    } as Response);

    const result = await service.importAndAnalyzePost({
      providerType: 'custom',
      url: 'https://www.xiaohongshu.com/explore/note-42',
    });

    expect(contentProviders.getRuntimeConfig).toHaveBeenCalledWith('custom');
    const firstCall = fetchMock.mock.calls[0];
    const requestUrl = firstCall?.[0];
    const requestInit = firstCall?.[1];

    expect(requestUrl).toBe('https://provider.example/xhs/posts/import');
    expect(requestInit?.body).toBe(
      JSON.stringify({
        noteId: undefined,
        url: 'https://www.xiaohongshu.com/explore/note-42',
      }),
    );
    expect(requestInit?.headers).toMatchObject({
      Authorization: 'Bearer provider-key',
    });
    expect(requestInit?.method).toBe('POST');
    expect(result.imported.posts[0]?.title).toBe(
      '通勤包这样收纳，早八少慌 10 分钟',
    );
    expect(result.analysis.engagement.likes).toBe(16000);
    expect(result.provider).toMatchObject({
      endpoint: 'https://provider.example/xhs/posts/import',
      type: 'custom',
    });
  });

  it('persists an imported post reference for an owned conversation', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({
          data: {
            collected_count: '8800',
            comment_count: 128,
            desc: '把通勤包里的东西拆成三个模块，早上直接照着拿。',
            image_list: ['https://example.com/cover.jpg'],
            liked_count: '1.6万',
            note_id: 'note-42',
            tag_list: ['通勤包', '效率工具'],
            title: '通勤包这样收纳，早八少慌 10 分钟',
          },
        }),
      ok: true,
    } as Response);

    const result = await service.importAndAnalyzePost(
      {
        conversationId: 'conversation-1',
        providerType: 'custom',
        url: 'https://www.xiaohongshu.com/explore/note-42',
      },
      'user-1',
    );
    const upsertArgs = prisma.xhsReference.upsert.mock.calls[0]?.[0];
    const importedPayload = upsertArgs
      ? (JSON.parse(upsertArgs.create.imported) as {
          posts: Array<{ title: string }>;
        })
      : undefined;
    const analysisPayload = upsertArgs
      ? (JSON.parse(upsertArgs.create.analysis) as {
          viralSignals: string[];
        })
      : undefined;

    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: 'conversation-1', userId: 'user-1' },
    });
    expect(upsertArgs).toBeDefined();
    if (!upsertArgs || !importedPayload || !analysisPayload) {
      throw new Error('Expected xhsReference.upsert to be called.');
    }
    expect(upsertArgs.where).toEqual({
      conversationId_kind_sourceId: {
        conversationId: 'conversation-1',
        kind: 'post',
        sourceId: 'note-42',
      },
    });
    expect(importedPayload.posts[0]?.title).toBe(
      '通勤包这样收纳，早八少慌 10 分钟',
    );
    expect(analysisPayload.viralSignals).toEqual(
      expect.arrayContaining(['高收藏价值']),
    );
    expect(result.reference).toMatchObject({
      conversationId: 'conversation-1',
      id: 'xhs-reference-1',
      kind: 'post',
      sourceId: 'note-42',
    });
  });

  it('imports an account from the configured provider before analyzing it', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({
          data: {
            desc: '小个子通勤穿搭，每周更新胶囊衣橱',
            fans: '8.6万',
            nickname: '阿鱼的衣橱',
            notes: [
              {
                collected_count: '9800',
                comment_count: 310,
                desc: '版型、长度、面料三个维度，照着买不踩雷。',
                liked_count: '1.2万',
                note_id: 'note-1',
                tag_list: ['小个子穿搭', '通勤穿搭'],
                title: '小个子通勤裤子这样买',
              },
            ],
            user_id: 'user-1',
          },
        }),
      ok: true,
    } as Response);

    const result = await service.importAndAnalyzeAccount({
      providerType: 'custom',
      url: 'https://www.xiaohongshu.com/user/profile/user-1',
    });

    expect(contentProviders.getRuntimeConfig).toHaveBeenCalledWith('custom');
    const firstCall = fetchMock.mock.calls[0];
    const requestUrl = firstCall?.[0];
    const requestInit = firstCall?.[1];

    expect(requestUrl).toBe('https://provider.example/xhs/accounts/import');
    expect(requestInit?.body).toBe(
      JSON.stringify({
        limit: undefined,
        url: 'https://www.xiaohongshu.com/user/profile/user-1',
        userId: undefined,
      }),
    );
    expect(requestInit?.headers).toMatchObject({
      Authorization: 'Bearer provider-key',
    });
    expect(requestInit?.method).toBe('POST');
    expect(result.imported.account.name).toBe('阿鱼的衣橱');
    expect(result.analysis.snapshot.followers).toBe(86000);
    expect(result.analysis.contentPillars).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '通勤穿搭' })]),
    );
  });

  it('lists stored references for an owned conversation with parsed payloads', async () => {
    const references = await service.listReferences('user-1', 'conversation-1');

    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: 'conversation-1', userId: 'user-1' },
    });
    expect(prisma.xhsReference.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      where: { conversationId: 'conversation-1' },
    });
    expect(references[0]).toMatchObject({
      analysis: {
        engagement: { total: 24928 },
        viralSignals: ['高收藏价值'],
      },
      imported: {
        posts: [{ title: '通勤包这样收纳，早八少慌 10 分钟' }],
      },
      kind: 'post',
      reference: {
        conversationId: 'conversation-1',
        id: 'xhs-reference-post-1',
        sourceId: 'note-42',
      },
      title: '通勤包这样收纳，早八少慌 10 分钟',
    });
  });

  it('deletes a stored reference only when it belongs to the user', async () => {
    const result = await service.deleteReference(
      'user-1',
      'xhs-reference-post-1',
    );

    expect(prisma.xhsReference.findFirst).toHaveBeenCalledWith({
      select: {
        conversation: { select: { userId: true } },
        id: true,
      },
      where: { id: 'xhs-reference-post-1' },
    });
    expect(prisma.xhsReference.delete).toHaveBeenCalledWith({
      where: { id: 'xhs-reference-post-1' },
    });
    expect(result).toEqual({ ok: true });
  });
});
