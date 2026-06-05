import { GenerationService } from './generation.service';
import type { OutlineForDraft } from './generation.types';

describe('GenerationService post drafts', () => {
  const service = new GenerationService();
  const generatedTopic = '租房厨房改造省钱清单';
  const generatedOutlineCases: Array<[string, number, number]> = [0, 1, 2].flatMap(
    (batchNo) =>
      service
        .createOutlines(generatedTopic, batchNo)
        .map(
          (_, outlineIndex): [string, number, number] => [
            generatedTopic,
            batchNo,
            outlineIndex,
          ],
        ),
  );
  const writerFacingPattern =
    /写 2 到 3 句|用定调的方式|避免空泛形容|直接写出|不要堆概念|第一屏|结尾把行动收回来|提醒读者|给读者|讲清楚|第一屏直接展示|用一句话定义|每一页只解决|定义这篇内容|拆开/;
  const generatedMetaLabelPattern =
    /痛点场景|准备清单|操作步骤|避坑提醒|结尾互动|开场画面|情绪铺垫|关键选择|结果反差|温柔收束|适合谁|不适合谁|核心步骤|替代方案|保存提示|真实开头|现场细节|尝试过程|关键发现|给读者的建议|原始状态|目标效果|工具材料|分步说明|最终复盘|必做三件事|可选加分项|预算控制|时间安排|失败补救|准备前|进行中|完成后|常见问题|评论引导|封面钩子|问题拆解|方法展开|例子证明|行动清单|人物状态|环境气味|动作细节|情绪变化|余味结尾/;

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
    expect(body).not.toMatch(generatedMetaLabelPattern);
    expect(draft.tags).toEqual(
      expect.arrayContaining(['小红书图文', '实用攻略', '高保存率']),
    );
    expect(draft.imagePrompt).toContain('标题区域');
  });

  it.each(generatedOutlineCases)(
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
      const publishableText = [draft.title, body].join('\n');

      expect(draft.sections).toHaveLength(5);
      expect(draft.caption).not.toContain(generatedOutline.hook);
      expect(publishableText).not.toMatch(writerFacingPattern);
      expect(body).not.toMatch(generatedMetaLabelPattern);
      for (const point of generatedOutline.points) {
        expect(body).not.toContain(point);
      }
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
    expect(draft.sections.join('\n')).not.toMatch(generatedMetaLabelPattern);
  });
});
