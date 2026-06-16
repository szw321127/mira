import type { XhsGenerationBrief, XhsGenerationBriefInput } from './types';
import { uniqueClean } from './shared';

export function buildXhsGenerationBrief(
  input: XhsGenerationBriefInput,
): XhsGenerationBrief {
  const sourcePatterns = uniqueClean(
    input.references.flatMap((reference) => reference.viralSignals),
  );
  const tags = uniqueClean(
    input.references.flatMap((reference) => reference.tagPatterns),
  ).slice(0, 6);
  const accountPillars =
    input.account?.contentPillars.slice(0, 3).map((pillar) => pillar.name) ??
    [];

  return {
    idea: input.idea.trim(),
    promptAdditions: [
      '参考样本只用于提炼结构、钩子和互动信号，不要照搬标题、正文、图片描述或具体案例。',
      '输出要像小红书图文成稿：封面一句话、正文分页、可直接复制发布的标题和标签。',
      sourcePatterns.length
        ? `优先借用这些有效模式：${sourcePatterns.join('、')}。`
        : '优先给出清晰收益、具体场景和低门槛执行步骤。',
      tags.length
        ? `标签方向可参考：${tags.map((tag) => `#${tag}`).join(' ')}。`
        : '标签要覆盖人群、场景、痛点和内容品类。',
      accountPillars.length
        ? `保持账号内容支柱一致：${accountPillars.join('、')}。`
        : '若没有账号信息，先建立清晰人群和场景定位。',
    ],
    recommendedSections: [
      '封面：一句具体结果或反常识钩子',
      '开头：说明目标人群、痛点和这篇能解决什么',
      '正文分页：每页只讲一个动作、判断或清单项',
      '复盘：给出避坑、适用边界或个人经验',
      '结尾：轻量互动问题，引导收藏或评论',
    ],
    sourcePatterns,
  };
}
