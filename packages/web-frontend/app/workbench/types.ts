import type {
  ImportedXhsAccountAnalysis,
  ImportedXhsPostAnalysis,
} from "@/lib/api";

export type OutlineTone = "guide" | "story" | "checklist";

export type ImageStatus = "idle" | "generating" | "ready" | "failed";

export type ReferenceImportMode = "account" | "post";

export type ReferenceImportState = {
  error: string;
  importedAccount: ImportedXhsAccountAnalysis | null;
  importedPosts: ImportedXhsPostAnalysis[];
  mode: ReferenceImportMode;
  url: string;
};

export type Outline = {
  id: string;
  batch: number;
  tone: OutlineTone;
  label: string;
  title: string;
  hook: string;
  points: string[];
};

export type PostDraft = {
  id: string;
  title: string;
  coverLine: string;
  caption: string;
  imageError: string | null;
  imageGeneratedAt: string | null;
  imageProvider: string | null;
  imagePrompt: string;
  imageStatus: ImageStatus;
  imageUrl: string | null;
  sections: string[];
  tags: string[];
  stale?: boolean;
};

export type Snapshot = {
  batch: number;
  outlines: Outline[];
  postDraft: PostDraft | null;
  selectedId: string;
};

export type SavedDraft = PostDraft & {
  savedDraftId: string;
  savedAt: string;
};

export type WorkspaceSnapshot = {
  batch: number;
  briefError: string;
  draftStale: boolean;
  lastSnapshot: Snapshot | null;
  outlines: Outline[];
  postDraft: PostDraft | null;
  referenceImport: ReferenceImportState;
  savedDrafts: SavedDraft[];
  seed: string;
  selectedId: string;
  statusMessage: string;
};

export type ConversationRecord = {
  conversationId: string;
  id: string;
  outlineCount: number;
  savedAt: string;
  snapshot: WorkspaceSnapshot | null;
  title: string;
  topic: string;
};

export type OutlineGroup = {
  batch: number;
  outlines: Outline[];
};

export type AutoSaveState = "idle" | "saving" | "saved" | "error";
