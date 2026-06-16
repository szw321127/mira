import type { XhsGenerationBrief, XhsImageTextPage, XhsImageTextPublishPackage, XhsImageTextPublishPackageInput } from './types';
import { clampInteger, truncateText, uniqueClean } from './shared';

export function buildXhsImageTextPublishPackage(
  input: XhsImageTextPublishPackageInput,
): XhsImageTextPublishPackage {
  const idea = input.idea.trim();
  const audience = input.audience?.trim();
  const tone = input.tone?.trim() || '真诚、具体、像朋友分享经验';
  const pageCount = clampInteger(input.pageCount ?? 6, 4, 7);
  const outlineItems = buildPublishOutlineItems(
    input.outline ?? [],
    input.brief,
    idea,
    pageCount,
  );
  const sourcePatterns = input.brief?.sourcePatterns ?? [];
  const hashtags = buildPublishHashtags(input, outlineItems);
  const titleCandidates = buildTitleCandidates(idea, audience, sourcePatterns);
  const coverHeadline = titleCandidates[0];
  const pages = buildImageTextPages({
    audience,
    coverHeadline,
    idea,
    outlineItems,
    pageCount,
    sourcePatterns,
    tone,
  });
  const caption = buildPublishCaption({
    audience,
    hashtags,
    idea,
    outlineItems,
    sourcePatterns,
  });
  const hashtagText = hashtags.map((tag) => `#${tag}`).join(' ');
  const pageText = pages
    .map(
      (page) => `P${page.pageNumber} ${page.headline}\n${page.body.join('\n')}`,
    )
    .join('\n\n');

  return {
    caption,
    copyBlocks: {
      caption,
      hashtags: hashtagText,
      pageText,
      publishText: `${coverHeadline}\n\n${caption}\n\n${hashtagText}`,
      title: coverHeadline,
    },
    hashtags,
    idea,
    imagePromptPack: pages.map((page) => page.imagePrompt),
    pages,
    platform: 'xiaohongshu',
    publishingChecklist: buildPublishingChecklist(sourcePatterns),
    titleCandidates,
  };
}

function buildPublishOutlineItems(
  outline: string[],
  brief: XhsGenerationBrief | undefined,
  idea: string,
  pageCount: number,
) {
  const contentSlots = Math.max(2, pageCount - 2);
  const recommended = brief?.recommendedSections ?? [];
  const cleaned = uniqueClean([...outline, ...recommended]);
  const fallback = [
    `先说清楚「${idea}」适合谁，以及能解决什么问题`,
    '拆成 3 个低门槛动作，每一步都给判断标准',
    '补充一个真实避坑或替代方案，降低用户试错成本',
    '最后给出可收藏的清单和互动问题',
  ];

  return [...cleaned, ...fallback].slice(0, contentSlots + 1);
}

function buildTitleCandidates(
  idea: string,
  audience: string | undefined,
  sourcePatterns: string[],
) {
  const subject = audience ? `${audience}看这篇` : idea;
  const hasCollectSignal = sourcePatterns.some((pattern) =>
    pattern.includes('收藏'),
  );
  const hasListSignal = sourcePatterns.some((pattern) =>
    pattern.includes('清单'),
  );

  return uniqueClean([
    hasCollectSignal ? `${subject}，这份直接收藏` : `${subject}，照着做就行`,
    hasListSignal ? `${idea}：一篇讲清楚` : `${idea}的低门槛做法`,
    `普通人也能复制的${idea}`,
  ]).slice(0, 3);
}

function buildImageTextPages(input: {
  audience?: string;
  coverHeadline: string;
  idea: string;
  outlineItems: string[];
  pageCount: number;
  sourcePatterns: string[];
  tone: string;
}) {
  const pages: XhsImageTextPage[] = [];
  const contentSlots = input.pageCount - 2;

  pages.push({
    body: [
      input.audience ? `适合：${input.audience}` : '适合：正在找具体做法的人',
      '看完能直接拿走一套可执行方法',
    ],
    designNotes: ['封面只放一个核心结论', '文字控制在 2-3 行'],
    headline: input.coverHeadline,
    imagePrompt: buildImagePrompt(input.idea, '封面', input.tone),
    pageNumber: 1,
    role: 'cover',
  });

  for (let index = 0; index < contentSlots; index += 1) {
    const item = input.outlineItems[index] ?? input.outlineItems[0];
    pages.push({
      body: [
        normalizeSentence(item),
        buildPageSupportLine(item, input.sourcePatterns),
      ],
      designNotes: ['每页只讲一个判断或动作', '优先使用编号、对比或清单布局'],
      headline: buildPageHeadline(item, index + 1),
      imagePrompt: buildImagePrompt(input.idea, item, input.tone),
      pageNumber: index + 2,
      role: 'content',
    });
  }

  pages.push({
    body: [
      input.outlineItems.at(-1) ?? '把上面的步骤保存下来，按场景逐个执行。',
      '你最想先改哪一步？评论区可以直接丢问题。',
    ],
    designNotes: ['结尾页给总结和轻互动', '保留收藏、评论的自然引导'],
    headline: '最后照这张清单检查',
    imagePrompt: buildImagePrompt(input.idea, '总结清单和互动结尾', input.tone),
    pageNumber: input.pageCount,
    role: 'summary',
  });

  return pages;
}

function buildPublishCaption(input: {
  audience?: string;
  hashtags: string[];
  idea: string;
  outlineItems: string[];
  sourcePatterns: string[];
}) {
  const audienceLine = input.audience
    ? `${input.audience}如果正在纠结${input.idea}，可以先从这几步开始。`
    : `如果你正在纠结${input.idea}，可以先从这几步开始。`;
  const patternLine = input.sourcePatterns.length
    ? `这篇重点做成${input.sourcePatterns.slice(0, 3).join('、')}，方便收藏后反复看。`
    : '这篇尽量讲具体动作，不讲空泛道理。';
  const actionLines = input.outlineItems
    .slice(0, 3)
    .map((item, index) => `${index + 1}. ${normalizeSentence(item)}`);

  return [
    audienceLine,
    patternLine,
    '',
    ...actionLines,
    '',
    '先收藏，真正要用的时候会省很多试错时间。',
    input.hashtags.length
      ? input.hashtags.map((tag) => `#${tag}`).join(' ')
      : '',
  ]
    .filter((line, index, lines) => line || lines[index - 1])
    .join('\n');
}

function buildPublishHashtags(
  input: XhsImageTextPublishPackageInput,
  outlineItems: string[],
) {
  const briefTags = extractHashTagsFromText(
    input.brief?.promptAdditions.join('\n') ?? '',
  );
  const audienceTags = input.audience ? [input.audience] : [];
  const ideaTags = inferHashtagsFromText(
    `${input.idea}\n${outlineItems.join('\n')}`,
  );

  return uniqueClean([
    ...briefTags,
    ...audienceTags,
    ...ideaTags,
    '小红书图文',
  ]).slice(0, 8);
}

function buildPublishingChecklist(sourcePatterns: string[]) {
  return [
    '封面是否在 3 秒内说清楚结果、对象或痛点。',
    '每一页是否只讲一个动作、判断或清单项。',
    '正文是否能直接复制发布，而不是只像提示词。',
    '参考样本只提炼结构和信号，不要照搬标题、正文或案例。',
    sourcePatterns.length
      ? `已复核参考模式：${sourcePatterns.slice(0, 3).join('、')}。`
      : '已补足人群、场景、痛点和互动问题。',
  ];
}

function buildImagePrompt(idea: string, pageTopic: string, tone: string) {
  return [
    `小红书图文页面，主题：${idea}`,
    `页面内容：${pageTopic}`,
    `风格：${tone}`,
    '真实生活感、清晰标题层级、留白充足、适合手机竖屏阅读',
  ].join('；');
}

function buildPageHeadline(item: string, step: number) {
  const normalized = item
    .replace(/^封面[:：]/, '')
    .replace(/^开头[:：]/, '')
    .replace(/^正文分页[:：]/, '')
    .replace(/^复盘[:：]/, '')
    .replace(/^结尾[:：]/, '')
    .trim();

  return `${step}. ${truncateText(normalized, 18)}`;
}

function buildPageSupportLine(item: string, sourcePatterns: string[]) {
  if (sourcePatterns.some((pattern) => pattern.includes('收藏'))) {
    return '把判断标准写具体，用户才会愿意收藏。';
  }
  if (sourcePatterns.some((pattern) => pattern.includes('讨论'))) {
    return '留一个能让用户代入的选择题，方便评论互动。';
  }
  if (/避坑|不要|别/.test(item)) {
    return '给出替代做法，不只告诉用户哪里错。';
  }

  return '用一个场景例子说明，避免写成泛泛建议。';
}

function extractHashTagsFromText(text: string) {
  const matches = text.matchAll(/#([\p{Script=Han}\w-]+)/gu);
  return Array.from(matches, (match) => match[1]);
}

function inferHashtagsFromText(text: string) {
  const tags: string[] = [];

  if (/通勤|上班|职场/.test(text)) tags.push('通勤穿搭');
  if (/胶囊|衣橱/.test(text)) tags.push('胶囊衣橱');
  if (/低预算|省钱|平价|便宜/.test(text)) tags.push('低预算');
  if (/新手|小白|初入职场/.test(text)) tags.push('新手指南');
  if (/避坑|不要|别/.test(text)) tags.push('避坑指南');
  if (/清单|步骤|教程|指南/.test(text)) tags.push('实用清单');

  return tags;
}

function normalizeSentence(value: string) {
  const normalized = value.trim().replace(/[。.!！]+$/, '');
  return `${normalized}。`;
}
