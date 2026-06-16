import { XhsResearchAiService } from './xhs-research-ai.service';

const baseAnalysis = {
  confidence: 'medium' as const,
  failedKeywords: [],
  idea: '给初入职场女生做低预算通勤穿搭',
  keywords: ['初入职场通勤穿搭', '低预算穿搭'],
  sampleCount: 2,
  status: 'completed' as const,
  summary: {
    avoidPatterns: ['不要照搬来源笔记标题、正文、图片或具体案例。'],
    contentAngles: ['低预算通勤衣橱'],
    hookPatterns: ['数字化清单结构'],
    outlinePatterns: ['收藏型清单：封面给结果，正文拆判断标准和复查表。'],
    standoutSamples: [
      {
        engagementTotal: 32000,
        interactionSummary: '赞 21000 / 藏 12000 / 评 280 / 转 0',
        matchReason: '体现数字化清单结构。',
        matchedKeyword: '初入职场通勤穿搭',
        sourceId: 'note-a',
        title: '普通女生也能复制的 12 件通勤衣橱',
        url: 'https://www.xiaohongshu.com/explore/note-a',
      },
    ],
    tagPatterns: ['通勤穿搭'],
  },
  warnings: [],
};

describe('XhsResearchAiService', () => {
  function createService() {
    const textModel = {
      generateTextJson: jest.fn(),
    };

    return {
      service: new XhsResearchAiService(textModel as never),
      textModel,
    };
  }

  it('uses the AI SDK text model to generate research summary and outlines from samples', async () => {
    const { service, textModel } = createService();
    textModel.generateTextJson.mockResolvedValueOnce({
      outlines: [
        {
          hook: '热门样本都在强调少买但好搭。',
          label: '痛点切入',
          points: ['P1 先讲乱买的痛点', 'P2 拆基础色', 'P3 给采购清单'],
          title: '初入职场别乱买，先搭这套低预算衣橱',
          tone: 'story',
        },
        {
          hook: '用步骤降低执行门槛。',
          label: '步骤教程',
          points: ['P1 定场景', 'P2 定颜色', 'P3 定单品'],
          title: '低预算通勤穿搭，从这 3 步开始',
          tone: 'guide',
        },
        {
          hook: '清单天然适合收藏。',
          label: '收藏清单',
          points: ['P1 必买', 'P2 可选', 'P3 避坑'],
          title: '初入职场通勤衣橱收藏清单',
          tone: 'checklist',
        },
      ],
      summary: {
        contentAngles: ['少买但好搭', '一衣多穿'],
        hookPatterns: ['反差开场', '数字化清单'],
        outlinePatterns: ['痛点 -> 清单 -> 避坑'],
        tagPatterns: ['通勤穿搭', '低预算穿搭'],
      },
      warnings: ['模型建议人工复核样本量。'],
    });

    const result = await service.generateResearchOutlines({
      analysis: baseAnalysis,
      idea: baseAnalysis.idea,
      keywords: baseAnalysis.keywords,
      mode: 'quick',
      samples: [
        {
          content: '原始正文只应该截断进 prompt，不应该完整透出到前端。',
          keyword: '初入职场通勤穿搭',
          metrics: { collects: '1.2万', comments: 280, likes: '2.1万' },
          sourceId: 'note-a',
          tags: ['通勤穿搭', '低预算'],
          title: '普通女生也能复制的 12 件通勤衣橱',
          url: 'https://www.xiaohongshu.com/explore/note-a',
        },
      ],
    });

    expect(textModel.generateTextJson).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 2800,
        messages: expect.any(Array),
        temperature: 0.65,
      }),
    );
    const prompt = JSON.stringify(textModel.generateTextJson.mock.calls[0][0]);
    expect(prompt).toContain('热门样本');
    expect(prompt).toContain('note-a');
    expect(result.analysis.summary.hookPatterns).toEqual([
      '反差开场',
      '数字化清单',
    ]);
    expect(result.analysis.summary.standoutSamples[0]?.sourceId).toBe('note-a');
    expect(result.analysis.warnings).toEqual(['模型建议人工复核样本量。']);
    expect(result.outlines).toHaveLength(3);
    expect(result.outlines[0]).toMatchObject({
      label: '痛点切入',
      title: '初入职场别乱买，先搭这套低预算衣橱',
    });
  });

  it('fills missing AI outlines with deterministic fallback outlines', async () => {
    const { service, textModel } = createService();
    textModel.generateTextJson.mockResolvedValueOnce({
      outlines: [
        {
          hook: '先讲痛点。',
          label: '痛点切入',
          points: ['P1 痛点', 'P2 方案', 'P3 避坑'],
          title: '低预算通勤衣橱别乱买',
          tone: 'story',
        },
      ],
      summary: {},
    });

    const result = await service.generateResearchOutlines({
      analysis: baseAnalysis,
      idea: baseAnalysis.idea,
      keywords: baseAnalysis.keywords,
      mode: 'quick',
      samples: [],
    });

    expect(result.outlines).toHaveLength(3);
    expect(result.outlines[0].title).toBe('低预算通勤衣橱别乱买');
    expect(result.outlines[1].points.length).toBeGreaterThanOrEqual(3);
  });
});
