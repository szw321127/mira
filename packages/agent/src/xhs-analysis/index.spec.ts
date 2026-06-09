import {
  analyzeXhsAccount,
  analyzeXhsPost,
  auditXhsImageTextPublishPackage,
  buildXhsCommercialWorkflow,
  buildXhsOutlineCandidates,
  buildXhsImageTextPublishPackage,
  buildXhsGenerationBrief,
  normalizeXhsImportedAccount,
  normalizeXhsImportedPosts,
  normalizeXhsCount,
} from './index';

describe('xhs analysis primitives', () => {
  it('normalizes Xiaohongshu engagement count text', () => {
    expect(normalizeXhsCount('1.2万')).toBe(12000);
    expect(normalizeXhsCount('3.5w')).toBe(35000);
    expect(normalizeXhsCount('赞')).toBe(0);
    expect(normalizeXhsCount(128)).toBe(128);
  });

  it('analyzes a publishable image-text post into reusable creative signals', () => {
    const result = analyzeXhsPost({
      title: '普通女生也能复制的通勤胶囊衣橱',
      content:
        '我用 12 件单品搭了 21 套通勤 look，省钱是真的，早上不用纠结也是真的。',
      tags: ['通勤穿搭', '胶囊衣橱', '普通女生'],
      images: [
        'https://example.com/cover.jpg',
        'https://example.com/page-2.jpg',
        'https://example.com/page-3.jpg',
      ],
      metrics: {
        collects: '1.1万',
        comments: 342,
        likes: '2.4万',
        shares: 840,
      },
    });

    expect(result.format).toBe('image-text');
    expect(result.engagement.total).toBe(36182);
    expect(result.viralSignals).toEqual(
      expect.arrayContaining(['高收藏价值', '多图分页信息密度']),
    );
    expect(result.generationHints).toEqual(
      expect.arrayContaining([
        expect.stringContaining('封面'),
        expect.stringContaining('标签'),
      ]),
    );
  });

  it('analyzes an account from recent posts and surfaces positioning advice', () => {
    const account = analyzeXhsAccount({
      bio: '小个子通勤穿搭，每周更新胶囊衣橱',
      followers: '8.6万',
      name: '阿鱼的衣橱',
      posts: [
        {
          title: '小个子通勤裤子这样买',
          content: '版型、长度、面料三个维度，照着买不踩雷。',
          tags: ['小个子穿搭', '通勤穿搭'],
          images: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
          metrics: { likes: '1.2万', collects: '9800', comments: 310 },
        },
        {
          title: '12 件单品搭出一周通勤',
          content: '把颜色控制在三类，重复穿也不会被看出来。',
          tags: ['胶囊衣橱', '通勤穿搭'],
          images: ['https://example.com/c.jpg', 'https://example.com/d.jpg'],
          metrics: { likes: '6800', collects: '7200', comments: 128 },
        },
        {
          title: '普通女生的低预算衣橱复盘',
          content: '哪些值得买，哪些只是看起来精致。',
          tags: ['普通女生', '省钱穿搭'],
          images: ['https://example.com/e.jpg'],
          metrics: { likes: '4200', collects: '5900', comments: 88 },
        },
      ],
    });

    expect(account.snapshot.followers).toBe(86000);
    expect(account.contentPillars[0]?.name).toBe('通勤穿搭');
    expect(account.topPosts[0]?.title).toContain('小个子通勤裤子');
    expect(account.nextActions).toEqual(
      expect.arrayContaining([expect.stringContaining('复用')]),
    );
  });

  it('builds generation briefs from references without copying source posts', () => {
    const brief = buildXhsGenerationBrief({
      idea: '给初入职场女生做低预算通勤穿搭',
      references: [
        analyzeXhsPost({
          title: '12 件单品搭出一周通勤',
          content: '把颜色控制在三类，重复穿也不会被看出来。',
          tags: ['胶囊衣橱', '通勤穿搭'],
          images: ['https://example.com/c.jpg', 'https://example.com/d.jpg'],
          metrics: { likes: '6800', collects: '7200', comments: 128 },
        }),
      ],
    });

    expect(brief.promptAdditions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('不要照搬'),
        expect.stringContaining('封面'),
      ]),
    );
    expect(brief.recommendedSections.length).toBeGreaterThanOrEqual(4);
    expect(brief.sourcePatterns[0]).toContain('高收藏价值');
  });

  it('builds three editable Xiaohongshu outline candidates from an idea and brief', () => {
    const brief = buildXhsGenerationBrief({
      idea: '给初入职场女生做低预算通勤穿搭',
      references: [
        analyzeXhsPost({
          title: '普通女生也能复制的通勤胶囊衣橱',
          content:
            '我用 12 件单品搭了 21 套通勤 look，省钱是真的，早上不用纠结也是真的。',
          tags: ['通勤穿搭', '胶囊衣橱', '普通女生'],
          images: [
            'https://example.com/cover.jpg',
            'https://example.com/page-2.jpg',
            'https://example.com/page-3.jpg',
          ],
          metrics: { likes: '2.4万', collects: '1.1万', comments: 342 },
        }),
      ],
    });

    const candidates = buildXhsOutlineCandidates({
      audience: '初入职场女生',
      brief,
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
    expect(
      candidates.every((candidate) => candidate.estimatedPageCount >= 4),
    ).toBe(true);
    expect(candidates[0]).toMatchObject({
      audience: '初入职场女生',
      idea: '给初入职场女生做低预算通勤穿搭',
    });
    expect(candidates[0]?.outline[0]).toContain('痛点');
    expect(candidates[1]?.outline[1]).toContain('步骤');
    expect(candidates[2]?.selectionReason).toContain('收藏');
  });

  it('builds a Xiaohongshu image-text publish package from an idea and reference brief', () => {
    const brief = buildXhsGenerationBrief({
      idea: '给初入职场女生做低预算通勤穿搭',
      references: [
        analyzeXhsPost({
          title: '普通女生也能复制的通勤胶囊衣橱',
          content:
            '我用 12 件单品搭了 21 套通勤 look，省钱是真的，早上不用纠结也是真的。',
          tags: ['通勤穿搭', '胶囊衣橱', '普通女生'],
          images: [
            'https://example.com/cover.jpg',
            'https://example.com/page-2.jpg',
            'https://example.com/page-3.jpg',
          ],
          metrics: {
            collects: '1.1万',
            comments: 342,
            likes: '2.4万',
            shares: 840,
          },
        }),
      ],
    });

    const publishPackage = buildXhsImageTextPublishPackage({
      audience: '初入职场女生',
      brief,
      idea: '给初入职场女生做低预算通勤穿搭',
      outline: [
        '先把通勤场景分成正式、普通、放松三类',
        '用 12 件基础单品覆盖一周搭配',
        '控制颜色和鞋包，降低试错成本',
        '列出最容易踩雷的购买误区',
      ],
      pageCount: 5,
    });

    expect(publishPackage.platform).toBe('xiaohongshu');
    expect(publishPackage.pages).toHaveLength(5);
    expect(publishPackage.pages[0]).toMatchObject({
      pageNumber: 1,
      role: 'cover',
    });
    expect(publishPackage.pages.every((page) => page.imagePrompt)).toBe(true);
    expect(publishPackage.caption).toContain('初入职场女生');
    expect(publishPackage.hashtags).toEqual(
      expect.arrayContaining(['通勤穿搭', '胶囊衣橱']),
    );
    expect(publishPackage.copyBlocks.publishText).toContain(
      publishPackage.titleCandidates[0],
    );
    expect(publishPackage.copyBlocks.publishText).toContain('#通勤穿搭');
    expect(publishPackage.publishingChecklist).toEqual(
      expect.arrayContaining([
        expect.stringContaining('封面'),
        expect.stringContaining('不要照搬'),
      ]),
    );
  });

  it('audits a Xiaohongshu publish package for commercial publish readiness', () => {
    const publishPackage = buildXhsImageTextPublishPackage({
      audience: '初入职场女生',
      idea: '给初入职场女生做低预算通勤穿搭',
      outline: [
        '正式场景用西装裤和针织衫打底',
        '普通上班日用衬衫、半裙和乐福鞋',
        '放松场景保留一件有记忆点的外套',
        '买之前先看版型、面料和复穿率',
      ],
      pageCount: 6,
    });

    const audit = auditXhsImageTextPublishPackage(publishPackage);

    expect(audit.ready).toBe(true);
    expect(audit.score).toBeGreaterThanOrEqual(85);
    expect(audit.passedChecks).toEqual(
      expect.arrayContaining(['cover', 'pages', 'copy', 'visuals', 'hashtags']),
    );
    expect(audit.blockers).toHaveLength(0);
  });

  it('reports actionable blockers for an incomplete publish package', () => {
    const publishPackage = buildXhsImageTextPublishPackage({
      idea: '职场穿搭',
      outline: ['穿白衬衫'],
      pageCount: 4,
    });

    publishPackage.pages = publishPackage.pages.slice(1, 3);
    publishPackage.imagePromptPack = [];
    publishPackage.hashtags = [];
    publishPackage.copyBlocks.publishText = '职场穿搭';

    const audit = auditXhsImageTextPublishPackage(publishPackage);

    expect(audit.ready).toBe(false);
    expect(audit.score).toBeLessThan(70);
    expect(audit.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ check: 'cover' }),
        expect.objectContaining({ check: 'visuals' }),
        expect.objectContaining({ check: 'hashtags' }),
      ]),
    );
    expect(audit.repairActions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('封面'),
        expect.stringContaining('图片提示词'),
      ]),
    );
  });

  it('normalizes imported posts from provider, browser, and manual sources', () => {
    const result = normalizeXhsImportedPosts([
      {
        source: 'provider',
        sourceId: 'provider-note-1',
        raw: {
          note_id: 'note-1',
          title: '普通女生通勤胶囊衣橱',
          desc: '12 件单品搭出一周通勤，省钱也省时间。',
          images_list: [
            { url: 'https://example.com/cover.jpg' },
            { url: 'https://example.com/page-2.jpg' },
          ],
          liked_count: '1.2万',
          collected_count: '8500',
          comment_count: '230',
          share_count: '480',
          tag_list: ['#通勤穿搭', '胶囊衣橱'],
          user: { nickname: '阿鱼的衣橱' },
          time: '2026-06-01',
        },
      },
      {
        source: 'browser',
        sourceId: 'browser-note-1',
        raw: {
          id: 'note-1',
          title: '重复卡片会被去重',
          description: '浏览器列表页重复抓到同一篇。',
          imageUrls: ['https://example.com/duplicated.jpg'],
        },
      },
      {
        source: 'manual',
        sourceId: 'manual-note-2',
        raw: {
          author: '阿鱼的衣橱',
          content: '买之前先看版型、面料和复穿率。',
          metrics: { likes: '8600', collects: '5300', comments: 92 },
          tags: '#通勤穿搭 #避坑指南',
          title: '低预算通勤衣橱避坑清单',
          url: 'https://www.xiaohongshu.com/explore/note-2',
        },
      },
    ]);

    expect(result.posts).toHaveLength(2);
    expect(result.posts[0]).toMatchObject({
      author: '阿鱼的衣橱',
      metrics: {
        collects: '8500',
        comments: '230',
        likes: '1.2万',
        shares: '480',
      },
      tags: ['通勤穿搭', '胶囊衣橱'],
      title: '普通女生通勤胶囊衣橱',
    });
    expect(result.posts[0]?.images).toEqual([
      'https://example.com/cover.jpg',
      'https://example.com/page-2.jpg',
    ]);
    expect(result.posts[1]?.tags).toEqual(['通勤穿搭', '避坑指南']);
    expect(result.dropped).toEqual([
      expect.objectContaining({
        reason: 'duplicate',
        sourceId: 'browser-note-1',
      }),
    ]);
    expect(result.sources).toEqual([
      expect.objectContaining({ normalizedId: 'note-1', source: 'provider' }),
      expect.objectContaining({ normalizedId: 'note-2', source: 'manual' }),
    ]);
  });

  it('normalizes an imported account and keeps posts ready for analysis', () => {
    const account = normalizeXhsImportedAccount({
      source: 'provider',
      sourceId: 'provider-user-1',
      raw: {
        avatar: 'https://example.com/avatar.jpg',
        desc: '小个子通勤穿搭，每周更新胶囊衣橱',
        fans: '8.6万',
        homepage: 'https://www.xiaohongshu.com/user/profile/user-1',
        nickname: '阿鱼的衣橱',
        notes: [
          {
            note_id: 'note-1',
            title: '小个子通勤裤子这样买',
            desc: '版型、长度、面料三个维度，照着买不踩雷。',
            liked_count: '1.2万',
            collected_count: '9800',
            comment_count: 310,
            tag_list: ['小个子穿搭', '通勤穿搭'],
          },
        ],
      },
    });

    expect(account.account).toMatchObject({
      bio: '小个子通勤穿搭，每周更新胶囊衣橱',
      followers: '8.6万',
      name: '阿鱼的衣橱',
      url: 'https://www.xiaohongshu.com/user/profile/user-1',
    });
    expect(account.account.posts[0]?.title).toBe('小个子通勤裤子这样买');
    expect(analyzeXhsAccount(account.account).snapshot.followers).toBe(86000);
    expect(account.source).toMatchObject({
      source: 'provider',
      sourceId: 'provider-user-1',
    });
  });

  it('builds an end-to-end commercial workflow from imported account and posts', () => {
    const workflow = buildXhsCommercialWorkflow({
      account: {
        source: 'provider',
        sourceId: 'provider-user-1',
        raw: {
          desc: '小个子通勤穿搭，每周更新胶囊衣橱',
          fans: '8.6万',
          homepage: 'https://www.xiaohongshu.com/user/profile/user-1',
          nickname: '阿鱼的衣橱',
          notes: [
            {
              note_id: 'note-1',
              title: '小个子通勤裤子这样买',
              desc: '版型、长度、面料三个维度，照着买不踩雷。',
              liked_count: '1.2万',
              collected_count: '9800',
              comment_count: 310,
              share_count: 520,
              tag_list: ['小个子穿搭', '通勤穿搭'],
            },
            {
              note_id: 'note-2',
              title: '12 件单品搭出一周通勤',
              desc: '把颜色控制在三类，重复穿也不会被看出来。',
              liked_count: '6800',
              collected_count: '7200',
              comment_count: 128,
              tag_list: ['胶囊衣橱', '通勤穿搭'],
            },
          ],
        },
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
      posts: [
        {
          source: 'browser',
          sourceId: 'browser-note-1',
          raw: {
            author: '阿鱼的衣橱',
            id: 'note-1',
            title: '小个子通勤裤子这样买',
          },
        },
        {
          source: 'manual',
          sourceId: 'manual-note-3',
          raw: {
            author: '阿鱼的衣橱',
            content: '哪些值得买，哪些只是看起来精致。',
            metrics: { likes: '4200', collects: '5900', comments: 88 },
            tags: '#普通女生 #省钱穿搭',
            title: '普通女生的低预算衣橱复盘',
          },
        },
      ],
    });

    expect(workflow.accountAnalysis?.snapshot.followers).toBe(86000);
    expect(workflow.accountAnalysis?.contentPillars[0]?.name).toBe('通勤穿搭');
    expect(workflow.importedPosts.posts).toHaveLength(2);
    expect(workflow.referencePosts).toHaveLength(3);
    expect(workflow.brief.promptAdditions).toEqual(
      expect.arrayContaining([expect.stringContaining('保持账号内容支柱')]),
    );
    expect(workflow.publishPackage.pages[0]?.role).toBe('cover');
    expect(workflow.audit.ready).toBe(true);
    expect(workflow.summary).toMatchObject({
      ready: true,
      referenceCount: 3,
      score: workflow.audit.score,
    });
  });
});
