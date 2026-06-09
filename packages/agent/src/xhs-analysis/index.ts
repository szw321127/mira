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
