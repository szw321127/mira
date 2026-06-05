import { GenerationService } from './generation.service';
import type { OutlineForDraft } from './generation.types';

describe('GenerationService post drafts', () => {
  const service = new GenerationService();

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
    expect(body).not.toMatch(
      /写 2 到 3 句|用定调的方式|避免空泛形容|直接写出|不要堆概念|第一屏|结尾把行动收回来|提醒读者/,
    );
    expect(draft.tags).toEqual(
      expect.arrayContaining(['小红书图文', '实用攻略', '高保存率']),
    );
    expect(draft.imagePrompt).toContain('标题区域');
  });
});
