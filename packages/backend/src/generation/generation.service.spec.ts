import { GenerationService } from './generation.service';
import type { OutlineForDraft } from './generation.types';

describe('GenerationService post drafts', () => {
  const service = new GenerationService();
  const writerFacingPattern =
    /写 2 到 3 句|用定调的方式|避免空泛形容|直接写出|不要堆概念|第一屏|结尾把行动收回来|提醒读者|给读者|讲清楚|第一屏直接展示|用一句话定义|每一页只解决|定义这篇内容|拆开/;
  const structureLabelPattern = /痛点场景|结尾互动|准备清单|操作步骤|避坑提醒/;

  const outline: OutlineForDraft = {
    hook: '先给读者一个立刻想收藏的理由。',
    id: 'outline-1',
    label: '高保存率',
    points: ['痛点场景', '准备清单', '操作步骤', '避坑提醒', '结尾互动'],
    title: '周末备餐也能很好看',
    tone: 'guide',
  };

  it('returns publish-ready prose instead of writing instructions', () => {
    const draft = service.createPostDraft(
      '小红书新手如何把周末备餐做得好看又省心',
      outline,
    );

    const body = [draft.caption, ...draft.sections].join('\n');

    expect(draft.title).toContain('周末备餐');
    expect(draft.coverLine.length).toBeLessThanOrEqual(18);
    expect(draft.sections).toHaveLength(5);
    expect(body).toContain('小红书新手');
    expect(draft.caption).not.toContain(outline.hook);
    expect(body).not.toMatch(writerFacingPattern);
    expect(body).not.toMatch(structureLabelPattern);
    expect(draft.tags).toEqual(
      expect.arrayContaining(['小红书图文', '实用攻略', '高保存率']),
    );
    expect(draft.imagePrompt).toContain('标题区域');
  });

  it.each([
    ['租房厨房改造省钱清单', 0, 0],
    ['租房厨房改造省钱清单', 1, 0],
    ['租房厨房改造省钱清单', 1, 1],
  ])(
    'does not leak generated outline prompt text into publish-ready drafts',
    (topic, batchNo, outlineIndex) => {
      const generatedOutline = service.createOutlines(topic, batchNo)[
        outlineIndex
      ];

      const draft = service.createPostDraft(topic, {
        ...generatedOutline,
        id: `generated-outline-${outlineIndex}`,
      });

      const body = [draft.caption, ...draft.sections].join('\n');

      expect(draft.sections).toHaveLength(5);
      expect(draft.caption).not.toContain(generatedOutline.hook);
      expect(body).not.toMatch(writerFacingPattern);
      expect(body).not.toMatch(structureLabelPattern);
      expect(draft.title.match(/租房厨房改造省钱清单/g)).toHaveLength(1);
    },
  );

  it.each([
    {
      expectedPoints: ['一个点', '准备好材料', '照着做步骤', '少踩坑做法', '保存后开做'],
      points: ['一个点'],
    },
    {
      expectedPoints: ['一', '二', '三', '四', '五'],
      points: ['一', '二', '三', '四', '五', '六'],
    },
  ])('normalizes edited outline points to exactly five sections', (example) => {
    const draft = service.createPostDraft('通勤包整理', {
      ...outline,
      points: example.points,
    });

    expect(draft.sections).toHaveLength(5);
    expect(draft.sections.map((section) => section.split('：')[0])).toEqual(
      example.expectedPoints.map((point, index) => `${index + 1}. ${point}`),
    );
    expect(draft.sections.join('\n')).not.toMatch(structureLabelPattern);
  });
});
