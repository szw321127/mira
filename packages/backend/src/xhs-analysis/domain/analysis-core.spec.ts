import {
  analyzeXhsAccount,
  analyzeXhsPopularSamples,
  analyzeXhsPost,
  buildXhsGenerationBrief,
  buildXhsOutlineCandidates,
  buildXhsResearchBackedOutlines,
  buildXhsSearchKeywords,
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

  it('builds bounded Xiaohongshu search keywords from one idea', () => {
    const quickKeywords = buildXhsSearchKeywords({
      idea: '给初入职场女生做低预算通勤穿搭',
      mode: 'quick',
    });
    const deepKeywords = buildXhsSearchKeywords({
      idea: '给初入职场女生做低预算通勤穿搭',
      mode: 'deep',
    });

    expect(quickKeywords.length).toBeGreaterThanOrEqual(3);
    expect(quickKeywords.length).toBeLessThanOrEqual(5);
    expect(deepKeywords.length).toBeGreaterThanOrEqual(5);
    expect(deepKeywords.length).toBeLessThanOrEqual(8);
    expect(quickKeywords).toEqual(
      expect.arrayContaining([
        expect.stringContaining('初入职场女生'),
        expect.stringContaining('低预算通勤穿搭'),
      ]),
    );
  });

  it('analyzes popular samples without exposing raw note bodies', () => {
    const analysis = analyzeXhsPopularSamples({
      failedKeywords: ['平价职场穿搭'],
      idea: '给初入职场女生做低预算通勤穿搭',
      keywords: ['低预算通勤穿搭', '初入职场女生穿搭'],
      samples: [
        {
          content: '这是一段很长的原始笔记正文，不应该出现在摘要里。',
          keyword: '低预算通勤穿搭',
          metrics: { collects: '1.2万', comments: 280, likes: '2.1万' },
          sourceId: 'note-a',
          tags: ['通勤穿搭', '低预算'],
          title: '普通女生也能复制的 12 件通勤衣橱',
          url: 'https://www.xiaohongshu.com/explore/note-a',
        },
        {
          content: '重复内容也不应该影响去重。',
          keyword: '初入职场女生穿搭',
          metrics: { collects: '8000', comments: 90, likes: '1.4万' },
          sourceId: 'note-a',
          tags: ['通勤穿搭'],
          title: '普通女生也能复制的 12 件通勤衣橱',
        },
        {
          content: '先讲痛点，再给清单和避坑。',
          keyword: '初入职场女生穿搭',
          metrics: { collects: '3000', comments: 188, likes: '9000' },
          sourceId: 'note-b',
          tags: ['职场穿搭', '避坑'],
          title: '刚上班别乱买衣服，先看这 5 个避坑点',
        },
      ],
    });

    expect(analysis.sampleCount).toBe(2);
    expect(analysis.confidence).toBe('medium');
    expect(analysis.failedKeywords).toEqual(['平价职场穿搭']);
    expect(analysis.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('部分关键词')]),
    );
    expect(analysis.summary.hookPatterns).toEqual(
      expect.arrayContaining(['低门槛痛点钩子', '数字化清单结构']),
    );
    expect(analysis.summary.standoutSamples[0]).toMatchObject({
      engagementTotal: 33280,
      matchedKeyword: '低预算通勤穿搭',
      sourceId: 'note-a',
      title: '普通女生也能复制的 12 件通勤衣橱',
    });
    expect(JSON.stringify(analysis.summary.standoutSamples)).not.toContain(
      '原始笔记正文',
    );
  });

  it('keeps sparse research usable with low-confidence editable outlines', () => {
    const analysis = analyzeXhsPopularSamples({
      idea: '新手做小红书早餐内容',
      keywords: ['小红书早餐内容', '新手早餐图文'],
      samples: [
        {
          keyword: '小红书早餐内容',
          metrics: { collects: 28, comments: 2, likes: 96 },
          sourceId: 'breakfast-1',
          tags: ['早餐', '新手'],
          title: '新手早餐记录',
        },
      ],
    });
    const outlines = buildXhsResearchBackedOutlines({
      analysis,
      idea: '新手做小红书早餐内容',
    });

    expect(analysis.confidence).toBe('low');
    expect(analysis.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('样本较少')]),
    );
    expect(outlines).toHaveLength(3);
    expect(outlines.every((outline) => outline.outline.length >= 4)).toBe(true);
    expect(outlines[0]?.selectionReason).toContain('低置信度');
  });
});
