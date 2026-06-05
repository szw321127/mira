import type {
  BackendConversationSummary,
  BackendOutline,
  BackendPostDraft,
  BackendSavedDraft,
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

export const toneMeta: Record<OutlineTone, { name: string; mark: string }> = {
  guide: { name: "实用攻略", mark: "攻略" },
  story: { name: "生活叙事", mark: "故事" },
  checklist: { name: "清单拆解", mark: "清单" },
};

export function isOutlineTone(tone: string): tone is OutlineTone {
  return tone === "guide" || tone === "story" || tone === "checklist";
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
    imagePrompt: draft.imagePrompt,
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

export function getDraftSignature(draft: PostDraft) {
  return JSON.stringify({
    caption: draft.caption.trim(),
    coverLine: draft.coverLine.trim(),
    imagePrompt: draft.imagePrompt.trim(),
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
    imagePrompt: snapshot.imagePrompt,
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
    imagePrompt: value.imagePrompt,
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
