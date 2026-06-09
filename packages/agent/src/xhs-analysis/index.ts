export type XhsMetricValue = number | string | null | undefined;

export interface XhsPostMetrics {
  collects?: XhsMetricValue;
  comments?: XhsMetricValue;
  likes?: XhsMetricValue;
  shares?: XhsMetricValue;
}

interface NormalizedXhsPostMetrics {
  collects: number;
  comments: number;
  likes: number;
  shares: number;
}

export interface XhsPostInput {
  author?: string;
  content?: string;
  images?: string[];
  metrics?: XhsPostMetrics;
  publishTime?: string;
  tags?: string[];
  title: string;
  url?: string;
  videoUrl?: string;
}

export interface XhsAccountInput {
  bio?: string;
  followers?: XhsMetricValue;
  name: string;
  posts: XhsPostInput[];
  url?: string;
}

export interface XhsPostAnalysis {
  contentAngles: string[];
  engagement: {
    collects: number;
    comments: number;
    likes: number;
    shares: number;
    total: number;
  };
  format: 'image-text' | 'text' | 'video';
  generationHints: string[];
  post: XhsPostInput;
  tagPatterns: string[];
  viralSignals: string[];
}

export interface XhsAccountAnalysis {
  contentPillars: Array<{ count: number; name: string }>;
  nextActions: string[];
  snapshot: {
    bio: string;
    followers: number;
    name: string;
    postCount: number;
    url?: string;
  };
  topPosts: XhsPostInput[];
}

export interface XhsGenerationBriefInput {
  account?: XhsAccountAnalysis;
  idea: string;
  references: XhsPostAnalysis[];
}

export interface XhsGenerationBrief {
  idea: string;
  promptAdditions: string[];
  recommendedSections: string[];
  sourcePatterns: string[];
}

export interface XhsImageTextPublishPackageInput {
  audience?: string;
  brief?: XhsGenerationBrief;
  idea: string;
  outline?: string[];
  pageCount?: number;
  tone?: string;
}

export interface XhsImageTextPage {
  body: string[];
  designNotes: string[];
  headline: string;
  imagePrompt: string;
  pageNumber: number;
  role: 'content' | 'cover' | 'summary';
}

export interface XhsImageTextPublishPackage {
  caption: string;
  copyBlocks: {
    caption: string;
    hashtags: string;
    pageText: string;
    publishText: string;
    title: string;
  };
  hashtags: string[];
  idea: string;
  imagePromptPack: string[];
  pages: XhsImageTextPage[];
  platform: 'xiaohongshu';
  publishingChecklist: string[];
  titleCandidates: string[];
}

export type XhsPublishReadinessCheck =
  | 'caption'
  | 'copy'
  | 'cover'
  | 'hashtags'
  | 'pages'
  | 'visuals';

export interface XhsPublishAuditIssue {
  check: XhsPublishReadinessCheck;
  message: string;
  severity: 'blocker' | 'warning';
}

export interface XhsPublishPackageAudit {
  blockers: XhsPublishAuditIssue[];
  passedChecks: XhsPublishReadinessCheck[];
  ready: boolean;
  repairActions: string[];
  score: number;
  warnings: XhsPublishAuditIssue[];
}

export type XhsImportedContentSource =
  | 'browser'
  | 'manual'
  | 'provider'
  | 'unknown';

export interface XhsImportedPostRecord {
  raw: Record<string, unknown>;
  source: XhsImportedContentSource;
  sourceId?: string;
}

export interface XhsImportDroppedRecord {
  reason: 'duplicate' | 'missing-title';
  source: XhsImportedContentSource;
  sourceId?: string;
}

export interface XhsImportSourceRecord {
  normalizedId: string;
  rawId?: string;
  source: XhsImportedContentSource;
  sourceId?: string;
  url?: string;
}

export interface XhsImportedPostsNormalization {
  dropped: XhsImportDroppedRecord[];
  posts: XhsPostInput[];
  sources: XhsImportSourceRecord[];
}

export interface XhsImportedAccountRecord {
  raw: Record<string, unknown>;
  source: XhsImportedContentSource;
  sourceId?: string;
}

export interface XhsImportedAccountNormalization {
  account: XhsAccountInput;
  dropped: XhsImportDroppedRecord[];
  source: XhsImportSourceRecord;
  sources: XhsImportSourceRecord[];
}

const COUNT_UNIT_PATTERN = /^([\d.]+)\s*([万wW])$/;

export function normalizeXhsCount(value: XhsMetricValue): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  }

  if (!value) {
    return 0;
  }

  const normalized = String(value)
    .trim()
    .replaceAll(',', '')
    .replace(/[+＋]/g, '');

  const unitMatch = normalized.match(COUNT_UNIT_PATTERN);
  if (unitMatch) {
    const amount = Number.parseFloat(unitMatch[1]);
    return Number.isFinite(amount) ? Math.round(amount * 10_000) : 0;
  }

  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
}

export function analyzeXhsPost(post: XhsPostInput): XhsPostAnalysis {
  const metrics = {
    collects: normalizeXhsCount(post.metrics?.collects),
    comments: normalizeXhsCount(post.metrics?.comments),
    likes: normalizeXhsCount(post.metrics?.likes),
    shares: normalizeXhsCount(post.metrics?.shares),
  };
  const total =
    metrics.collects + metrics.comments + metrics.likes + metrics.shares;
  const imageCount = post.images?.filter(Boolean).length ?? 0;
  const format = post.videoUrl
    ? 'video'
    : imageCount > 0
      ? 'image-text'
      : 'text';
  const viralSignals = buildViralSignals(post, metrics, imageCount);
  const tagPatterns = uniqueClean(post.tags ?? []).slice(0, 8);

  return {
    contentAngles: inferContentAngles(post),
    engagement: {
      ...metrics,
      total,
    },
    format,
    generationHints: buildGenerationHints(post, viralSignals, tagPatterns),
    post,
    tagPatterns,
    viralSignals,
  };
}

export function analyzeXhsAccount(
  account: XhsAccountInput,
): XhsAccountAnalysis {
  const analyzedPosts = account.posts.map(analyzeXhsPost);
  const contentPillars = rankContentPillars(account.posts);
  const topPosts = analyzedPosts
    .toSorted((left, right) => right.engagement.total - left.engagement.total)
    .slice(0, 5)
    .map((item) => item.post);

  return {
    contentPillars,
    nextActions: buildAccountNextActions(
      account,
      analyzedPosts,
      contentPillars,
    ),
    snapshot: {
      bio: account.bio?.trim() ?? '',
      followers: normalizeXhsCount(account.followers),
      name: account.name,
      postCount: account.posts.length,
      url: account.url,
    },
    topPosts,
  };
}

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

export function auditXhsImageTextPublishPackage(
  publishPackage: XhsImageTextPublishPackage,
): XhsPublishPackageAudit {
  const passedChecks: XhsPublishReadinessCheck[] = [];
  const blockers: XhsPublishAuditIssue[] = [];
  const warnings: XhsPublishAuditIssue[] = [];

  evaluateCover(publishPackage, passedChecks, blockers, warnings);
  evaluatePages(publishPackage, passedChecks, blockers, warnings);
  evaluateCopy(publishPackage, passedChecks, blockers, warnings);
  evaluateCaption(publishPackage, passedChecks, blockers, warnings);
  evaluateVisuals(publishPackage, passedChecks, blockers, warnings);
  evaluateHashtags(publishPackage, passedChecks, blockers, warnings);

  const score = calculatePublishAuditScore(passedChecks, blockers, warnings);

  return {
    blockers,
    passedChecks,
    ready: blockers.length === 0 && score >= 80,
    repairActions: buildAuditRepairActions(blockers, warnings),
    score,
    warnings,
  };
}

export function normalizeXhsImportedPosts(
  records: XhsImportedPostRecord[],
): XhsImportedPostsNormalization {
  const posts: XhsPostInput[] = [];
  const sources: XhsImportSourceRecord[] = [];
  const dropped: XhsImportDroppedRecord[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    const normalized = normalizeImportedPostRecord(record);

    if (!normalized.post.title.trim()) {
      dropped.push({
        reason: 'missing-title',
        source: record.source,
        sourceId: record.sourceId,
      });
      continue;
    }

    const dedupeKey = buildImportedPostDedupeKey(
      normalized.source.normalizedId,
      normalized.post,
    );
    if (seen.has(dedupeKey)) {
      dropped.push({
        reason: 'duplicate',
        source: record.source,
        sourceId: record.sourceId,
      });
      continue;
    }

    seen.add(dedupeKey);
    posts.push(normalized.post);
    sources.push(normalized.source);
  }

  return { dropped, posts, sources };
}

export function normalizeXhsImportedAccount(
  record: XhsImportedAccountRecord,
): XhsImportedAccountNormalization {
  const raw = record.raw;
  const notes = asRecordArray(
    raw.notes ?? raw.posts ?? raw.items ?? raw.noteList ?? raw.note_list,
  ).map((note, index) => ({
    raw: note,
    source: record.source,
    sourceId: `${record.sourceId ?? record.source}-note-${index + 1}`,
  }));
  const postsNormalization = normalizeXhsImportedPosts(notes);
  const url = pickString(
    raw.homepage,
    raw.url,
    raw.profileUrl,
    raw.profile_url,
  );
  const rawId = pickString(raw.user_id, raw.userId, raw.id, raw.uid);
  const normalizedId = rawId ?? extractXhsIdFromUrl(url) ?? record.sourceId;

  return {
    account: {
      bio: pickString(raw.desc, raw.bio, raw.description, raw.signature) ?? '',
      followers: pickMetricValue(raw.fans, raw.followers, raw.follower_count),
      name:
        pickString(raw.nickname, raw.name, raw.userName, raw.user_name) ?? '',
      posts: postsNormalization.posts,
      url,
    },
    dropped: postsNormalization.dropped,
    source: {
      normalizedId: normalizedId ?? record.sourceId ?? 'unknown-account',
      rawId,
      source: record.source,
      sourceId: record.sourceId,
      url,
    },
    sources: postsNormalization.sources,
  };
}

function buildViralSignals(
  post: XhsPostInput,
  metrics: NormalizedXhsPostMetrics,
  imageCount: number,
) {
  const signals: string[] = [];
  const title = post.title;
  const content = post.content ?? '';

  if (metrics.collects >= Math.max(1000, metrics.likes * 0.35)) {
    signals.push('高收藏价值');
  }
  if (metrics.comments >= 100) {
    signals.push('评论讨论度高');
  }
  if (metrics.shares >= 300) {
    signals.push('可转发参考价值');
  }
  if (imageCount >= 3) {
    signals.push('多图分页信息密度');
  }
  if (/[0-9一二三四五六七八九十]+/.test(title + content)) {
    signals.push('数字化清单结构');
  }
  if (/普通|新手|小白|低预算|复制|避坑|不要|别/.test(title + content)) {
    signals.push('低门槛痛点钩子');
  }

  return signals.length ? signals : ['基础内容样本'];
}

function inferContentAngles(post: XhsPostInput): string[] {
  const text = `${post.title}\n${post.content ?? ''}\n${(post.tags ?? []).join(' ')}`;
  const angles: string[] = [];

  if (/通勤|上班|职场/.test(text)) angles.push('职场/通勤场景');
  if (/低预算|省钱|平价|便宜/.test(text)) angles.push('低预算解决方案');
  if (/清单|步骤|教程|指南|避坑/.test(text)) angles.push('清单教程');
  if (/普通|小个子|新手|小白|女生|男生/.test(text)) angles.push('明确人群');
  if (/复盘|真实|亲测|经验/.test(text)) angles.push('真实经验复盘');

  return angles.length ? angles : ['泛生活方式'];
}

function buildGenerationHints(
  post: XhsPostInput,
  viralSignals: string[],
  tagPatterns: string[],
) {
  const hints = [
    `封面要保留「${post.title.slice(0, 18)}」这类一眼能懂的利益点。`,
    `正文可借用：${viralSignals.join('、')}。`,
  ];

  if (tagPatterns.length) {
    hints.push(`标签覆盖这些语义方向：${tagPatterns.join('、')}。`);
  }

  if ((post.images?.length ?? 0) > 1) {
    hints.push('适合生成多页图文：封面、步骤页、对比页、总结页。');
  }

  return hints;
}

function rankContentPillars(posts: XhsPostInput[]) {
  const counts = new Map<string, number>();

  for (const post of posts) {
    for (const tag of uniqueClean(post.tags ?? [])) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ count, name }))
    .toSorted(
      (left, right) =>
        right.count - left.count || left.name.localeCompare(right.name),
    )
    .slice(0, 8);
}

function buildAccountNextActions(
  account: XhsAccountInput,
  posts: XhsPostAnalysis[],
  pillars: Array<{ count: number; name: string }>,
) {
  const actions: string[] = [];
  const topSignals = uniqueClean(
    posts.slice(0, 3).flatMap((post) => post.viralSignals),
  );

  if (pillars[0]) {
    actions.push(
      `复用「${pillars[0].name}」作为主内容支柱，连续做 5-7 篇同主题变体。`,
    );
  }
  if (topSignals.length) {
    actions.push(
      `把高表现内容里的「${topSignals.slice(0, 3).join('、')}」沉淀成标题和封面模板。`,
    );
  }
  if (posts.length < 9) {
    actions.push(
      '继续采样最近 9-15 篇笔记后再判断稳定定位，避免只凭单篇爆款下结论。',
    );
  }
  if (!account.bio?.trim()) {
    actions.push('补齐账号简介，让用户 3 秒内看懂你帮谁解决什么问题。');
  }

  return actions;
}

function uniqueClean(values: string[]) {
  return Array.from(
    new Set(
      values.map((value) => value.trim().replace(/^#/, '')).filter(Boolean),
    ),
  );
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

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function clampInteger(value: number, min: number, max: number) {
  const integer = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, integer));
}

function evaluateCover(
  publishPackage: XhsImageTextPublishPackage,
  passedChecks: XhsPublishReadinessCheck[],
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  const cover = publishPackage.pages.find((page) => page.role === 'cover');

  if (!cover) {
    blockers.push({
      check: 'cover',
      message: '缺少封面页，用户第一眼无法判断内容价值。',
      severity: 'blocker',
    });
    return;
  }

  if (cover.headline.trim().length < 8) {
    warnings.push({
      check: 'cover',
      message: '封面标题偏短，建议补充明确对象、结果或痛点。',
      severity: 'warning',
    });
    return;
  }

  passedChecks.push('cover');
}

function evaluatePages(
  publishPackage: XhsImageTextPublishPackage,
  passedChecks: XhsPublishReadinessCheck[],
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  if (publishPackage.pages.length < 4) {
    blockers.push({
      check: 'pages',
      message: '图文页数少于 4 页，信息密度不足。',
      severity: 'blocker',
    });
    return;
  }

  if (!publishPackage.pages.some((page) => page.role === 'summary')) {
    warnings.push({
      check: 'pages',
      message: '缺少总结页，建议补一页收藏清单或互动问题。',
      severity: 'warning',
    });
    return;
  }

  if (
    publishPackage.pages.some(
      (page) => !page.headline.trim() || page.body.length === 0,
    )
  ) {
    blockers.push({
      check: 'pages',
      message: '存在缺少标题或正文的分页。',
      severity: 'blocker',
    });
    return;
  }

  passedChecks.push('pages');
}

function evaluateCopy(
  publishPackage: XhsImageTextPublishPackage,
  passedChecks: XhsPublishReadinessCheck[],
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  const publishText = publishPackage.copyBlocks.publishText.trim();
  const hasTitle = publishPackage.titleCandidates.some((title) =>
    publishText.includes(title),
  );
  const hasHashtag = publishText.includes('#');

  if (publishText.length < 80 || !hasTitle || !hasHashtag) {
    blockers.push({
      check: 'copy',
      message: '可复制发布文本不完整，需要包含标题、正文和标签。',
      severity: 'blocker',
    });
    return;
  }

  if (/提示词|prompt|生成/.test(publishText)) {
    warnings.push({
      check: 'copy',
      message: '发布文本仍像生成提示，建议改成面向用户的自然表达。',
      severity: 'warning',
    });
    return;
  }

  passedChecks.push('copy');
}

function evaluateCaption(
  publishPackage: XhsImageTextPublishPackage,
  passedChecks: XhsPublishReadinessCheck[],
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  const caption = publishPackage.caption.trim();

  if (caption.length < 60) {
    blockers.push({
      check: 'caption',
      message: '正文 caption 太短，缺少具体场景、步骤或互动引导。',
      severity: 'blocker',
    });
    return;
  }

  if (!/[？?]/.test(caption) && !/评论|收藏|你/.test(caption)) {
    warnings.push({
      check: 'caption',
      message: '正文缺少轻互动，建议加入评论问题或收藏理由。',
      severity: 'warning',
    });
    return;
  }

  passedChecks.push('caption');
}

function evaluateVisuals(
  publishPackage: XhsImageTextPublishPackage,
  passedChecks: XhsPublishReadinessCheck[],
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  const pagePrompts = publishPackage.pages.map((page) =>
    page.imagePrompt.trim(),
  );
  const promptPack = publishPackage.imagePromptPack.map((prompt) =>
    prompt.trim(),
  );

  if (
    promptPack.length !== publishPackage.pages.length ||
    pagePrompts.some((prompt) => !prompt)
  ) {
    blockers.push({
      check: 'visuals',
      message: '图片提示词数量或内容不完整，无法生成完整图文页。',
      severity: 'blocker',
    });
    return;
  }

  if (!promptPack.every((prompt) => /手机|竖屏|小红书/.test(prompt))) {
    warnings.push({
      check: 'visuals',
      message: '图片提示词缺少小红书竖屏语境，可能影响出图一致性。',
      severity: 'warning',
    });
    return;
  }

  passedChecks.push('visuals');
}

function evaluateHashtags(
  publishPackage: XhsImageTextPublishPackage,
  passedChecks: XhsPublishReadinessCheck[],
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  const hashtags = uniqueClean(publishPackage.hashtags);

  if (hashtags.length < 3) {
    blockers.push({
      check: 'hashtags',
      message: '标签少于 3 个，建议覆盖人群、场景和内容品类。',
      severity: 'blocker',
    });
    return;
  }

  if (hashtags.length > 10) {
    warnings.push({
      check: 'hashtags',
      message: '标签数量偏多，建议保留最相关的 6-8 个。',
      severity: 'warning',
    });
    return;
  }

  passedChecks.push('hashtags');
}

function calculatePublishAuditScore(
  passedChecks: XhsPublishReadinessCheck[],
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  const score = passedChecks.length * 16 + (passedChecks.length ? 4 : 0);
  const penalty = blockers.length * 18 + warnings.length * 6;
  return Math.max(0, Math.min(100, score - penalty));
}

function buildAuditRepairActions(
  blockers: XhsPublishAuditIssue[],
  warnings: XhsPublishAuditIssue[],
) {
  const issues = [...blockers, ...warnings];

  if (!issues.length) {
    return ['发布包已达到基础发布标准，可进入人工微调或出图流程。'];
  }

  const actions = issues.map((issue) => {
    switch (issue.check) {
      case 'cover':
        return '补强封面：用一句话写清楚对象、痛点和可获得的结果。';
      case 'pages':
        return '补齐分页：至少保留封面、2-4 页正文和 1 页总结互动。';
      case 'copy':
        return '重写可复制发布文本：必须包含标题、正文段落和话题标签。';
      case 'caption':
        return '扩写 caption：加入具体场景、步骤、避坑或互动问题。';
      case 'visuals':
        return '补齐图片提示词：每一页都需要对应的小红书竖屏出图描述。';
      case 'hashtags':
        return '补齐标签：覆盖人群、场景、痛点、品类和可搜索关键词。';
      default:
        return issue.message;
    }
  });

  return uniqueClean(actions);
}

function normalizeImportedPostRecord(record: XhsImportedPostRecord): {
  post: XhsPostInput;
  source: XhsImportSourceRecord;
} {
  const raw = record.raw;
  const url = pickString(raw.url, raw.link, raw.shareUrl, raw.share_url);
  const rawId = pickString(
    raw.note_id,
    raw.noteId,
    raw.noteid,
    raw.id,
    raw.item_id,
    raw.itemId,
  );
  const normalizedId =
    rawId ?? extractXhsIdFromUrl(url) ?? record.sourceId ?? buildTitleHash(raw);
  const title =
    pickString(raw.title, raw.displayTitle, raw.display_title) ?? '';
  const user = asRecord(raw.user ?? raw.authorInfo ?? raw.author_info);
  const author = pickString(
    raw.author,
    raw.nickname,
    raw.userName,
    raw.user_name,
    user?.nickname,
    user?.name,
  );

  return {
    post: {
      author,
      content:
        pickString(
          raw.content,
          raw.desc,
          raw.description,
          raw.text,
          raw.body,
        ) ?? '',
      images: normalizeImageUrls(
        raw.images,
        raw.imageUrls,
        raw.image_urls,
        raw.images_list,
        raw.imageList,
        raw.cover,
      ),
      metrics: {
        collects: pickMetricValue(
          raw.collects,
          raw.collected_count,
          raw.collect_count,
          raw.collectCount,
        ),
        comments: pickMetricValue(
          raw.comments,
          raw.comment_count,
          raw.commentCount,
        ),
        likes: pickMetricValue(
          raw.likes,
          raw.liked_count,
          raw.like_count,
          raw.likeCount,
        ),
        shares: pickMetricValue(raw.shares, raw.share_count, raw.shareCount),
      },
      publishTime: pickString(
        raw.publishTime,
        raw.publish_time,
        raw.time,
        raw.createdAt,
      ),
      tags: normalizeImportedTags(raw.tags, raw.tag_list, raw.tagList),
      title,
      url,
      videoUrl: pickString(raw.videoUrl, raw.video_url, raw.video),
    },
    source: {
      normalizedId,
      rawId,
      source: record.source,
      sourceId: record.sourceId,
      url,
    },
  };
}

function buildImportedPostDedupeKey(normalizedId: string, post: XhsPostInput) {
  if (normalizedId && normalizedId !== 'unknown-post') {
    return normalizedId;
  }

  return `${post.url ?? ''}:${post.author ?? ''}:${post.title}`;
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function pickMetricValue(...values: unknown[]): XhsMetricValue {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function normalizeImageUrls(...values: unknown[]) {
  const urls: string[] = [];

  for (const value of values) {
    if (typeof value === 'string') {
      urls.push(value);
      continue;
    }

    for (const item of asArray(value)) {
      if (typeof item === 'string') {
        urls.push(item);
        continue;
      }

      const record = asRecord(item);
      const url = record
        ? pickString(record.url, record.src, record.imageUrl, record.image_url)
        : undefined;
      if (url) {
        urls.push(url);
      }
    }
  }

  return uniqueClean(urls);
}

function normalizeImportedTags(...values: unknown[]) {
  const tags: string[] = [];

  for (const value of values) {
    if (typeof value === 'string') {
      tags.push(...extractTagsFromString(value));
      continue;
    }

    for (const item of asArray(value)) {
      if (typeof item === 'string') {
        tags.push(item);
        continue;
      }

      const record = asRecord(item);
      const tag = record
        ? pickString(record.name, record.tagName, record.tag_name, record.title)
        : undefined;
      if (tag) {
        tags.push(tag);
      }
    }
  }

  return uniqueClean(tags);
}

function extractTagsFromString(value: string) {
  const matches = value.matchAll(/[#＃]([^#＃\s]+)/g);
  const hashTags = Array.from(matches, (match) => match[1]);

  if (hashTags.length) {
    return hashTags;
  }

  return value
    .split(/[\s,，、]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function extractXhsIdFromUrl(url: string | undefined) {
  if (!url) {
    return undefined;
  }

  const match = url.match(/(?:explore|profile)\/([^/?#]+)/);
  return match?.[1];
}

function buildTitleHash(raw: Record<string, unknown>) {
  const title = pickString(raw.title, raw.displayTitle, raw.display_title);
  return title ? `title:${title}` : 'unknown-post';
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecordArray(value: unknown) {
  return asArray(value).flatMap((item) => {
    const record = asRecord(item);
    return record ? [record] : [];
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
