import {
  analyzeXhsAccount,
  analyzeXhsPost,
  buildXhsImageTextPublishPackage,
  buildXhsGenerationBrief,
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
});
