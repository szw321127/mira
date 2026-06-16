import type {
  XhsImageTextPublishPackage,
  XhsPublishPackageAudit,
} from './domain';
import { parseStringArray } from '../common/json';
import type { BackendPostDraftView } from '../conversations/conversations.types';

export function toPostDraftDataFromPublishPackage(
  publishPackage: XhsImageTextPublishPackage,
) {
  const coverPage =
    publishPackage.pages.find((page) => page.role === 'cover') ??
    publishPackage.pages[0];

  return {
    caption: publishPackage.caption,
    coverLine:
      (coverPage?.headline ?? publishPackage.titleCandidates[0] ?? '').slice(
        0,
        18,
      ) || publishPackage.idea.slice(0, 18),
    imageError: null,
    imageGeneratedAt: null,
    imagePrompt: publishPackage.imagePromptPack[0] ?? '',
    imageProvider: null,
    imageStatus: 'idle',
    imageUrl: null,
    sections: publishPackage.pages.map((page) =>
      [`P${page.pageNumber} ${page.headline}`, ...page.body].join('\n'),
    ),
    stale: false,
    tags: publishPackage.hashtags,
    title:
      publishPackage.copyBlocks.title ||
      publishPackage.titleCandidates[0] ||
      publishPackage.idea,
  };
}

export function toPublishStatusMessage(audit: XhsPublishPackageAudit) {
  return audit.ready
    ? '小红书发布包已生成，可以复制或继续微调。'
    : `发布包已生成，建议先处理：${audit.repairActions[0] ?? '检查内容完整度。'}`;
}

export function toBackendPostDraftView(draft: {
  caption: string;
  conversationId: string;
  coverLine: string;
  createdAt: Date;
  id: string;
  imageError: string | null;
  imageGeneratedAt: Date | null;
  imagePrompt: string;
  imageProvider: string | null;
  imageStatus: string;
  imageUrl: string | null;
  outlineId: string | null;
  sections: string;
  stale: boolean;
  tags: string;
  title: string;
  updatedAt: Date;
}): BackendPostDraftView {
  return {
    caption: draft.caption,
    conversationId: draft.conversationId,
    coverLine: draft.coverLine,
    createdAt: draft.createdAt,
    id: draft.id,
    imageError: draft.imageError,
    imageGeneratedAt: draft.imageGeneratedAt,
    imageProvider: draft.imageProvider,
    imagePrompt: draft.imagePrompt,
    imageStatus: draft.imageStatus,
    imageUrl: draft.imageUrl,
    outlineId: draft.outlineId,
    sections: parseStringArray(draft.sections),
    stale: draft.stale,
    tags: parseStringArray(draft.tags),
    title: draft.title,
    updatedAt: draft.updatedAt,
  };
}
