import type { XhsPostAnalysis, XhsPostInput } from './types';
import { normalizeXhsCount, uniqueClean } from './shared';

type NormalizedXhsPostMetrics = {
  collects: number;
  comments: number;
  likes: number;
  shares: number;
};

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
