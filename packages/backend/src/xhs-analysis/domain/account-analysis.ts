import type { XhsAccountAnalysis, XhsAccountInput, XhsPostAnalysis, XhsPostInput } from './types';
import { analyzeXhsPost } from './post-analysis';
import { normalizeXhsCount, uniqueClean } from './shared';

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
