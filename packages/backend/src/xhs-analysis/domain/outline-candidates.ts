import type { XhsGenerationBrief, XhsOutlineCandidate, XhsOutlineCandidateInput, XhsOutlineStrategy } from './types';
import { clampInteger, uniqueClean } from './shared';

export function buildXhsOutlineCandidates(
  input: XhsOutlineCandidateInput,
): XhsOutlineCandidate[] {
  const idea = input.idea.trim();
  const audience = input.audience?.trim() || '正在解决这个问题的人';
  const sourcePatterns = input.brief?.sourcePatterns ?? [];
  const strategies: XhsOutlineStrategy[] = [
    'pain-point',
    'step-by-step',
    'checklist',
  ];

  return strategies.map((strategy, index) =>
    buildOutlineCandidate({
      audience,
      idea,
      index,
      sourcePatterns,
      strategy,
    }),
  );
}

function buildOutlineCandidate(input: {
  audience: string;
  idea: string;
  index: number;
  sourcePatterns: string[];
  strategy: XhsOutlineStrategy;
}): XhsOutlineCandidate {
  const outline = buildOutlineSections(input);

  return {
    audience: input.audience,
    estimatedPageCount: clampInteger(outline.length + 1, 4, 7),
    id: `outline-${input.index + 1}-${input.strategy}`,
    idea: input.idea,
    outline,
    selectionReason: buildOutlineSelectionReason(
      input.strategy,
      input.sourcePatterns,
    ),
    sourcePatterns: input.sourcePatterns,
    strategy: input.strategy,
    title: buildOutlineTitle(input.idea, input.audience, input.strategy),
  };
}

function buildOutlineSections(input: {
  audience: string;
  idea: string;
  sourcePatterns: string[];
  strategy: XhsOutlineStrategy;
}) {
  if (input.strategy === 'pain-point') {
    return [
      `痛点开场：${input.audience}为什么会卡在「${input.idea}」`,
      '反差钩子：普通人也能复制的低门槛方案',
      '场景拆解：先把最常见的 3 个使用场景讲清楚',
      '避坑复盘：哪些做法看起来精致但不值得',
      '互动收尾：让用户评论自己最想先解决哪一步',
    ];
  }

  if (input.strategy === 'step-by-step') {
    return [
      `目标说明：这篇帮${input.audience}完成「${input.idea}」`,
      '步骤 1：先确定人群、预算、场景或使用边界',
      '步骤 2：给出可直接照做的配置、清单或动作',
      '步骤 3：用一个真实例子说明如何落地',
      '步骤 4：补充替代方案和容易踩雷的地方',
    ];
  }

  return [
    `收藏清单：${input.idea}先看这一篇`,
    '必备项：列出最关键的 3-5 个判断标准',
    '可选项：根据预算、场景或风格做取舍',
    '避坑项：明确哪些情况不要盲目跟风',
    '保存项：最后整理成一张复查表',
  ];
}

function buildOutlineTitle(
  idea: string,
  audience: string,
  strategy: XhsOutlineStrategy,
) {
  if (strategy === 'pain-point') {
    return `${audience}最容易忽略的${idea}问题`;
  }
  if (strategy === 'step-by-step') {
    return `${idea}：从 0 到能照做`;
  }

  return `${idea}收藏清单`;
}

function buildOutlineSelectionReason(
  strategy: XhsOutlineStrategy,
  sourcePatterns: string[],
) {
  const patternText = sourcePatterns.length
    ? `，同时吸收${sourcePatterns.slice(0, 2).join('、')}`
    : '';

  if (strategy === 'pain-point') {
    return `适合用户痛点强、需要先建立代入感的选题${patternText}。`;
  }
  if (strategy === 'step-by-step') {
    return `适合教程型内容，用户可以按步骤执行${patternText}。`;
  }

  return `适合做收藏和复查，信息密度高，天然引导用户保存${patternText}。`;
}
