import type {
  BackendConversationSummary,
  BackendOutline,
  BackendPostDraft,
  BackendSavedDraft,
  XhsCommercialWorkflow,
  XhsResearchRun,
  XhsResearchSummary,
} from "@/lib/api";
import type {
  ConversationRecord,
  Outline,
  OutlineGroup,
  OutlineTone,
  PostDraft,
  SavedDraft,
  Snapshot,
  WorkspaceSnapshot,
} from "./types";

export const DEFAULT_SEED =
  "周末在家低成本做一顿有仪式感的晚餐，适合发小红书";
export const LOCAL_XHS_ID_PREFIX = "xhs:";

export const toneMeta: Record<OutlineTone, { name: string; mark: string }> = {
  guide: { name: "实用攻略", mark: "攻略" },
  story: { name: "生活叙事", mark: "故事" },
  checklist: { name: "清单拆解", mark: "清单" },
};

export function isOutlineTone(tone: string): tone is OutlineTone {
  return tone === "guide" || tone === "story" || tone === "checklist";
}

export function isLocalXhsId(id: string | null | undefined) {
  return Boolean(id?.startsWith(LOCAL_XHS_ID_PREFIX));
}

export function toBackendSelectedOutlineId(id: string | null | undefined) {
  if (!id || isLocalXhsId(id)) return "";
  return id;
}

export function toBackendOptionalOutlineId(id: string | null | undefined) {
  if (!id || isLocalXhsId(id)) return undefined;
  return id;
}

export function formatRecordTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function formatAutoSaveTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function mapBackendOutline(
  outline: BackendOutline,
  batch: number,
): Outline {
  return {
    batch,
    hook: outline.hook,
    id: outline.id,
    label: outline.label,
    points: outline.points,
    title: outline.title,
    tone: isOutlineTone(outline.tone) ? outline.tone : "guide",
  };
}

export function mapBackendPostDraft(draft: BackendPostDraft): PostDraft {
  return {
    caption: draft.caption,
    coverLine: draft.coverLine,
    id: draft.id,
    imageError: draft.imageError,
    imageGeneratedAt: draft.imageGeneratedAt,
    imageProvider: draft.imageProvider,
    imagePrompt: draft.imagePrompt,
    imageStatus: draft.imageStatus,
    imageUrl: draft.imageUrl,
    sections: draft.sections,
    stale: draft.stale,
    tags: draft.tags,
    title: draft.title,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function imageStatus(value: unknown): PostDraft["imageStatus"] {
  return value === "generating" || value === "ready" || value === "failed"
    ? value
    : "idle";
}

function isXhsPublishAudit(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.ready === "boolean" &&
    typeof value.score === "number" &&
    Array.isArray(value.blockers) &&
    Array.isArray(value.passedChecks) &&
    Array.isArray(value.repairActions) &&
    Array.isArray(value.warnings)
  );
}

export function mapSnapshotXhsCommercialWorkflow(
  value: unknown,
): XhsCommercialWorkflow | null {
  if (!isRecord(value)) return null;
  if (!isRecord(value.publishPackage) || !isXhsPublishAudit(value.audit)) {
    return null;
  }

  return value as unknown as XhsCommercialWorkflow;
}

function isXhsResearchSummary(value: unknown): value is XhsResearchSummary {
  return (
    isRecord(value) &&
    isStringArray(value.avoidPatterns) &&
    isStringArray(value.contentAngles) &&
    isStringArray(value.hookPatterns) &&
    isStringArray(value.outlinePatterns) &&
    Array.isArray(value.standoutSamples) &&
    isStringArray(value.tagPatterns)
  );
}

export function mapSnapshotXhsResearchRun(value: unknown): XhsResearchRun | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.idea !== "string" ||
    !isStringArray(value.keywords) ||
    typeof value.sampleCount !== "number" ||
    !isStringArray(value.warnings) ||
    !isStringArray(value.failedKeywords) ||
    !isXhsResearchSummary(value.summary)
  ) {
    return null;
  }

  return {
    confidence:
      value.confidence === "high" ||
      value.confidence === "medium" ||
      value.confidence === "low"
        ? value.confidence
        : "low",
    createdAt:
      typeof value.createdAt === "string"
        ? value.createdAt
        : new Date().toISOString(),
    failedKeywords: value.failedKeywords,
    id: value.id,
    idea: value.idea,
    keywords: value.keywords,
    mode: value.mode === "deep" ? "deep" : "quick",
    providerEndpoint: optionalString(value.providerEndpoint),
    providerType:
      value.providerType === "xhs_connector"
        ? "xhs_connector"
        : value.providerType === "tikhub"
        ? "tikhub"
        : value.providerType === "none"
          ? "none"
          : "custom",
    sampleCount: value.sampleCount,
    status:
      value.status === "completed" ||
      value.status === "completed_with_warning" ||
      value.status === "fallback_no_samples"
        ? value.status
        : "completed_with_warning",
    summary: value.summary,
    warnings: value.warnings,
  };
}

export function getDraftSignature(draft: PostDraft) {
  return JSON.stringify({
    caption: draft.caption.trim(),
    coverLine: draft.coverLine.trim(),
    imageError: draft.imageError?.trim() ?? null,
    imageProvider: draft.imageProvider?.trim() ?? null,
    imagePrompt: draft.imagePrompt.trim(),
    imageStatus: draft.imageStatus,
    imageUrl: draft.imageUrl?.trim() ?? null,
    sections: draft.sections.map((section) => section.trim()),
    tags: draft.tags.map((tag) => tag.trim()),
    title: draft.title.trim(),
  });
}

export function dedupeSavedDrafts(drafts: SavedDraft[]) {
  const signatures = new Set<string>();

  return drafts.filter((draft) => {
    const signature = getDraftSignature(draft);

    if (signatures.has(signature)) return false;

    signatures.add(signature);
    return true;
  });
}

export function mapSavedDraft(savedDraft: BackendSavedDraft): SavedDraft | null {
  const snapshot = savedDraft.snapshot;

  if (
    !isRecord(snapshot) ||
    typeof snapshot.id !== "string" ||
    typeof snapshot.title !== "string" ||
    typeof snapshot.coverLine !== "string" ||
    typeof snapshot.caption !== "string" ||
    typeof snapshot.imagePrompt !== "string" ||
    !isStringArray(snapshot.sections) ||
    !isStringArray(snapshot.tags)
  ) {
    return null;
  }

  return {
    caption: snapshot.caption,
    coverLine: snapshot.coverLine,
    id: snapshot.id,
    imageError: optionalString(snapshot.imageError),
    imageGeneratedAt: optionalString(snapshot.imageGeneratedAt),
    imageProvider: optionalString(snapshot.imageProvider),
    imagePrompt: snapshot.imagePrompt,
    imageStatus: imageStatus(snapshot.imageStatus),
    imageUrl: optionalString(snapshot.imageUrl),
    savedAt: formatRecordTime(savedDraft.createdAt),
    savedDraftId: savedDraft.id,
    sections: snapshot.sections,
    stale: typeof snapshot.stale === "boolean" ? snapshot.stale : false,
    tags: snapshot.tags,
    title: snapshot.title,
  };
}

export function mapSnapshotOutline(value: unknown): Outline | null {
  if (
    !isRecord(value) ||
    typeof value.batch !== "number" ||
    typeof value.hook !== "string" ||
    typeof value.id !== "string" ||
    typeof value.label !== "string" ||
    !isStringArray(value.points) ||
    typeof value.title !== "string" ||
    typeof value.tone !== "string"
  ) {
    return null;
  }

  return {
    batch: value.batch,
    hook: value.hook,
    id: value.id,
    label: value.label,
    points: value.points,
    title: value.title,
    tone: isOutlineTone(value.tone) ? value.tone : "guide",
  };
}

export function mapSnapshotPostDraft(value: unknown): PostDraft | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.coverLine !== "string" ||
    typeof value.caption !== "string" ||
    typeof value.imagePrompt !== "string" ||
    !isStringArray(value.sections) ||
    !isStringArray(value.tags)
  ) {
    return null;
  }

  return {
    caption: value.caption,
    coverLine: value.coverLine,
    id: value.id,
    imageError: optionalString(value.imageError),
    imageGeneratedAt: optionalString(value.imageGeneratedAt),
    imageProvider: optionalString(value.imageProvider),
    imagePrompt: value.imagePrompt,
    imageStatus: imageStatus(value.imageStatus),
    imageUrl: optionalString(value.imageUrl),
    sections: value.sections,
    stale: typeof value.stale === "boolean" ? value.stale : false,
    tags: value.tags,
    title: value.title,
  };
}

export function mapUndoSnapshot(value: unknown): Snapshot | null {
  if (
    !isRecord(value) ||
    typeof value.batch !== "number" ||
    !Array.isArray(value.outlines) ||
    typeof value.selectedId !== "string"
  ) {
    return null;
  }

  const mappedOutlines = value.outlines
    .map((outline) => mapSnapshotOutline(outline))
    .filter((outline): outline is Outline => Boolean(outline));

  if (mappedOutlines.length !== value.outlines.length) return null;

  const postDraft =
    value.postDraft === null || value.postDraft === undefined
      ? null
      : mapSnapshotPostDraft(value.postDraft);

  if (value.postDraft && !postDraft) return null;

  return {
    batch: value.batch,
    latestResearch: mapSnapshotXhsResearchRun(value.latestResearch),
    outlines: mappedOutlines,
    postDraft,
    selectedId: value.selectedId,
  };
}

export function mapSnapshotSavedDraft(value: unknown): SavedDraft | null {
  if (
    !isRecord(value) ||
    typeof value.savedAt !== "string" ||
    typeof value.savedDraftId !== "string"
  ) {
    return null;
  }

  const draft = mapSnapshotPostDraft(value);

  if (!draft) return null;

  return {
    ...draft,
    savedAt: value.savedAt,
    savedDraftId: value.savedDraftId,
  };
}

export function mapWorkspaceSnapshot(value: unknown): WorkspaceSnapshot | null {
  if (
    !isRecord(value) ||
    typeof value.batch !== "number" ||
    !Array.isArray(value.outlines) ||
    typeof value.seed !== "string" ||
    typeof value.selectedId !== "string"
  ) {
    return null;
  }

  const outlines = value.outlines
    .map((outline) => mapSnapshotOutline(outline))
    .filter((outline): outline is Outline => Boolean(outline));

  if (outlines.length !== value.outlines.length) return null;

  const postDraft =
    value.postDraft === null || value.postDraft === undefined
      ? null
      : mapSnapshotPostDraft(value.postDraft);

  if (value.postDraft && !postDraft) return null;

  const savedDrafts = Array.isArray(value.savedDrafts)
    ? dedupeSavedDrafts(
        value.savedDrafts
          .map((draft) => mapSnapshotSavedDraft(draft))
          .filter((draft): draft is SavedDraft => Boolean(draft)),
      )
    : [];

  return {
    batch: value.batch,
    briefError: typeof value.briefError === "string" ? value.briefError : "",
    draftStale:
      typeof value.draftStale === "boolean" ? value.draftStale : false,
    lastSnapshot: mapUndoSnapshot(value.lastSnapshot),
    latestResearch: mapSnapshotXhsResearchRun(value.latestResearch),
    latestWorkflow: mapSnapshotXhsCommercialWorkflow(value.latestWorkflow),
    outlines,
    postDraft,
    savedDrafts,
    seed: value.seed,
    selectedId: value.selectedId,
    statusMessage:
      typeof value.statusMessage === "string"
        ? value.statusMessage
        : "已从自动保存恢复当前工作状态。",
  };
}

export function createAutoSaveKey(snapshot: WorkspaceSnapshot) {
  return JSON.stringify({
    batch: snapshot.batch,
    briefError: snapshot.briefError,
    draftStale: snapshot.draftStale,
    latestResearch: snapshot.latestResearch,
    latestWorkflow: snapshot.latestWorkflow,
    outlines: snapshot.outlines,
    postDraft: snapshot.postDraft,
    savedDrafts: snapshot.savedDrafts,
    seed: snapshot.seed,
    selectedId: snapshot.selectedId,
  });
}

export function mapConversationRecord(
  conversation: BackendConversationSummary,
): ConversationRecord {
  return {
    conversationId: conversation.id,
    id: conversation.id,
    outlineCount: conversation.outlineBatchCount * 3,
    savedAt: formatRecordTime(conversation.updatedAt),
    snapshot: null,
    title: conversation.title,
    topic: conversation.topic,
  };
}

export function getFullPostText(postDraft: PostDraft) {
  return [
    postDraft.title,
    postDraft.caption,
    ...postDraft.sections,
    postDraft.tags.map((tag) => `#${tag}`).join(" "),
  ].join("\n");
}

export function getPostBodyText(postDraft: PostDraft) {
  return [postDraft.caption, ...postDraft.sections].join("\n");
}

export function groupOutlines(outlines: Outline[]): OutlineGroup[] {
  return outlines.reduce<OutlineGroup[]>((groups, outline) => {
    const group = groups.find((item) => item.batch === outline.batch);

    if (group) {
      group.outlines.push(outline);
      return groups;
    }

    return [...groups, { batch: outline.batch, outlines: [outline] }];
  }, []);
}
