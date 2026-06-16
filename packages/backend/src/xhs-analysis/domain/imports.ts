import type { XhsAccountInput, XhsImportedAccountNormalization, XhsImportedAccountRecord, XhsImportedPostsNormalization, XhsImportedPostRecord, XhsImportDroppedRecord, XhsImportSourceRecord, XhsMetricValue, XhsPostInput } from './types';
import { uniqueClean } from './shared';

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
