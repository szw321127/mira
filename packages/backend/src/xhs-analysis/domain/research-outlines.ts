import type {
  XhsOutlineCandidate,
  XhsPopularSampleInput,
  XhsPopularSamplesAnalysis,
  XhsPopularSamplesAnalysisInput,
  XhsPostAnalysis,
  XhsResearchBackedOutlineInput,
  XhsResearchConfidence,
  XhsSearchKeywordInput,
} from './types';
import { analyzeXhsPost } from './post-analysis';
import { buildXhsOutlineCandidates } from './outline-candidates';
import { uniqueClean } from './shared';

export function buildXhsSearchKeywords(
  input: XhsSearchKeywordInput,
): string[] {
  const idea = normalizeSearchText(input.idea);
  const mode = input.mode ?? 'quick';
  const limit = mode === 'deep' ? 8 : 5;
  const minimum = mode === 'deep' ? 5 : 3;
  const audience = inferSearchAudience(idea);
  const topic = inferSearchTopic(idea, audience);
  const candidates = uniqueClean([
    ...(input.extraKeywords ?? []),
    audience && topic ? `${audience}${topic}` : '',
    topic,
    audience,
    ...inferSearchKeywordVariants(idea, audience, topic),
    idea,
  ]).filter((keyword) => keyword.length >= 2);

  const fallbackSeeds = uniqueClean([
    topic ? `${topic} 小红书` : '',
    audience ? `${audience} 小红书` : '',
    '小红书爆款图文',
    '小红书选题大纲',
    '小红书内容结构',
  ]);
  const keywords = uniqueClean([...candidates, ...fallbackSeeds]).slice(
    0,
    limit,
  );

  return keywords.length >= minimum
    ? keywords
    : uniqueClean([
        ...keywords,
        ...fallbackSeeds,
        `${idea.slice(0, 18)} 小红书`,
      ]).slice(0, limit);
}

export function analyzeXhsPopularSamples(
  input: XhsPopularSamplesAnalysisInput,
): XhsPopularSamplesAnalysis {
  const rankedSamples = rankPopularSamples(input.samples);
  const sampleCount = rankedSamples.length;
  const failedKeywords = uniqueClean(input.failedKeywords ?? []);
  const confidence = calculateResearchConfidence(
    sampleCount,
    failedKeywords.length,
  );
  const warnings = buildResearchWarnings(sampleCount, failedKeywords);
  const hookPatterns = uniqueClean(
    rankedSamples.flatMap((sample) => sample.analysis.viralSignals),
  ).slice(0, 8);
  const tagPatterns = uniqueClean(
    rankedSamples.flatMap((sample) => sample.analysis.tagPatterns),
  ).slice(0, 8);
  const contentAngles = uniqueClean(
    rankedSamples.flatMap((sample) => sample.analysis.contentAngles),
  ).slice(0, 8);

  return {
    confidence,
    failedKeywords,
    idea: input.idea.trim(),
    keywords: uniqueClean(input.keywords),
    sampleCount,
    status:
      sampleCount === 0
        ? 'fallback_no_samples'
        : warnings.length
          ? 'completed_with_warning'
          : 'completed',
    summary: {
      avoidPatterns: buildResearchAvoidPatterns(sampleCount, failedKeywords),
      contentAngles,
      hookPatterns,
      outlinePatterns: buildResearchOutlinePatterns(hookPatterns),
      standoutSamples: rankedSamples.slice(0, 5).map((sample) => ({
        engagementTotal: sample.analysis.engagement.total,
        interactionSummary: buildInteractionSummary(sample.analysis),
        matchedKeyword: sample.sample.keyword ?? input.keywords[0] ?? '',
        matchReason: buildSampleMatchReason(sample.analysis, input.idea),
        sourceId:
          sample.sample.sourceId ??
          sample.sample.url ??
          sample.analysis.post.title,
        title: truncateResearchText(sample.analysis.post.title, 36),
        url: sample.sample.url,
      })),
      tagPatterns,
    },
    warnings,
  };
}

export function buildXhsResearchBackedOutlines(
  input: XhsResearchBackedOutlineInput,
): XhsOutlineCandidate[] {
  const sourcePatterns = uniqueClean([
    ...input.analysis.summary.hookPatterns,
    ...input.analysis.summary.outlinePatterns,
    ...input.analysis.summary.contentAngles,
  ]).slice(0, 8);
  const candidates = buildXhsOutlineCandidates({
    audience: input.audience,
    brief: {
      idea: input.idea,
      promptAdditions: [
        '这些大纲来自小红书热门样本的结构信号，但仍需要用户按自己的经验编辑。',
      ],
      recommendedSections:
        input.analysis.summary.outlinePatterns.length > 0
          ? input.analysis.summary.outlinePatterns.map(
              (pattern) => `结构参考：${pattern}`,
            )
          : [
              '封面：一句具体结果或痛点',
              '正文：拆成可执行步骤',
              '结尾：给出收藏理由和互动问题',
            ],
      sourcePatterns,
    },
    idea: input.idea,
  });
  const confidencePrefix =
    input.analysis.confidence === 'low'
      ? '低置信度参考：样本较少，适合先生成后人工 review。'
      : input.analysis.confidence === 'medium'
        ? '中等置信度参考：已结合部分热门样本信号。'
        : '高置信度参考：已结合多条热门样本信号。';

  return candidates.map((candidate) => ({
    ...candidate,
    selectionReason: `${confidencePrefix}${candidate.selectionReason}`,
    sourcePatterns,
  }));
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .replace(/[，。！？、；：,.!?;:]/g, ' ')
    .replace(/\s+/g, ' ');
}

function inferSearchAudience(idea: string) {
  const audienceMatch = idea.match(
    /(初入职场(?:女生|男生|新人|人)?|小个子(?:女生|男生)?|普通(?:女生|男生|人)|学生党|上班族|宝妈|新手|小白|女生|男生)/,
  );

  return audienceMatch?.[1] ?? '';
}

function inferSearchTopic(idea: string, audience: string) {
  const afterVerb =
    idea.match(/(?:做|写|发|分享|整理|生成|创作)(.+)$/)?.[1]?.trim() ?? '';
  const withoutAudience = idea.replace(audience, '').trim();
  const topic = (afterVerb || withoutAudience || idea)
    .replace(/^给/, '')
    .replace(/^(一篇|一个|一些|相关|关于)/, '')
    .trim();

  return topic || idea;
}

function inferSearchKeywordVariants(
  idea: string,
  audience: string,
  topic: string,
) {
  const variants: string[] = [];
  const text = `${idea} ${topic}`;

  if (/通勤|上班|职场/.test(text)) {
    variants.push('通勤穿搭', '职场穿搭');
  }
  if (/低预算|省钱|平价/.test(text)) {
    variants.push(topic.includes('穿搭') ? '低预算穿搭' : '低预算生活方式');
  }
  if (/早餐|晚餐|做饭|食谱/.test(text)) {
    variants.push('小红书美食图文', '日常饮食记录');
  }
  if (/收纳|整理/.test(text)) {
    variants.push('收纳清单', '整理教程');
  }
  if (/小红书/.test(text)) {
    variants.push(topic.replace(/小红书/g, '').trim());
  }
  if (audience && topic) {
    variants.push(`${audience}${topic.replace(audience, '')}`);
  }

  return variants;
}

function rankPopularSamples(samples: XhsPopularSampleInput[]) {
  const byKey = new Map<
    string,
    {
      analysis: XhsPostAnalysis;
      sample: XhsPopularSampleInput;
      score: number;
    }
  >();

  for (const sample of samples) {
    const title = sample.title?.trim();

    if (!title) continue;

    const analysis = analyzeXhsPost(sample);
    const key = sample.sourceId ?? sample.url ?? title;
    const score = calculateResearchSampleScore(analysis);
    const current = byKey.get(key);

    if (!current || score > current.score) {
      byKey.set(key, { analysis, sample, score });
    }
  }

  return Array.from(byKey.values()).toSorted(
    (left, right) =>
      right.score - left.score ||
      right.analysis.engagement.total - left.analysis.engagement.total ||
      left.analysis.post.title.localeCompare(right.analysis.post.title),
  );
}

function calculateResearchSampleScore(analysis: XhsPostAnalysis) {
  return (
    analysis.engagement.likes +
    analysis.engagement.collects * 1.4 +
    analysis.engagement.comments * 1.8 +
    analysis.engagement.shares * 1.6
  );
}

function calculateResearchConfidence(
  sampleCount: number,
  failedKeywordCount: number,
): XhsResearchConfidence {
  if (sampleCount >= 8 && failedKeywordCount === 0) return 'high';
  if (sampleCount >= 2) return 'medium';
  return 'low';
}

function buildResearchWarnings(sampleCount: number, failedKeywords: string[]) {
  const warnings: string[] = [];

  if (failedKeywords.length) {
    warnings.push(
      `部分关键词搜索失败：${failedKeywords.slice(0, 3).join('、')}。`,
    );
  }
  if (sampleCount === 0) {
    warnings.push(
      '本次没有获取到可用样本，已生成可编辑兜底大纲，请人工 review 后再使用。',
    );
  } else if (sampleCount < 3) {
    warnings.push(
      '参考样本较少，结果更适合作为第一版方向，请结合自己的经验继续编辑。',
    );
  }

  return warnings;
}

function buildResearchAvoidPatterns(
  sampleCount: number,
  failedKeywords: string[],
) {
  return uniqueClean([
    '不要照搬来源笔记标题、正文、图片或具体案例。',
    sampleCount < 3 ? '样本较少时，不要把趋势判断写得过满。' : '',
    failedKeywords.length ? '有关键词失败时，避免把覆盖范围表述为全平台结论。' : '',
  ]);
}

function buildResearchOutlinePatterns(hookPatterns: string[]) {
  const patterns: string[] = [];

  if (hookPatterns.some((pattern) => pattern.includes('收藏'))) {
    patterns.push('收藏型清单：封面给结果，正文拆判断标准和复查表。');
  }
  if (hookPatterns.some((pattern) => pattern.includes('痛点'))) {
    patterns.push('痛点型结构：先指出常见误区，再给低门槛替代方案。');
  }
  if (hookPatterns.some((pattern) => pattern.includes('数字'))) {
    patterns.push('数字化结构：用数量、步骤或天数降低阅读成本。');
  }
  if (hookPatterns.some((pattern) => pattern.includes('评论'))) {
    patterns.push('讨论型结尾：留下一个具体选择题，引导评论。');
  }

  return patterns.length
    ? patterns
    : ['结果先行：先给用户可拿走的结论，再解释步骤和边界。'];
}

function buildInteractionSummary(analysis: XhsPostAnalysis) {
  const { collects, comments, likes, shares } = analysis.engagement;

  return `赞 ${likes} / 藏 ${collects} / 评 ${comments} / 转 ${shares}`;
}

function buildSampleMatchReason(analysis: XhsPostAnalysis, idea: string) {
  const signals = analysis.viralSignals.slice(0, 2).join('、');
  const angles = analysis.contentAngles.slice(0, 2).join('、');
  const parts = uniqueClean([signals, angles]);

  return parts.length
    ? `与「${idea.slice(0, 18)}」相关，体现${parts.join('、')}。`
    : `与「${idea.slice(0, 18)}」相关，可参考其结构。`;
}

function truncateResearchText(value: string, maxLength: number) {
  const normalized = value.trim();

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}
