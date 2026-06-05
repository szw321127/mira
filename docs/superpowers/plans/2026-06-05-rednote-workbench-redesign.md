# RedNote Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the frontend into a focused RedNote creation workbench: narrow conversation rail, idea input, latest-outline workspace with collapsed older batches, editable final post editor, full and field-level copy actions.

**Architecture:** Keep backend APIs unchanged. Move workspace types, mapping helpers, draft signatures, and autosave behavior out of `app/page.tsx`, then rebuild the UI from small client components using Tailwind utility classes. `page.tsx` remains the authenticated state coordinator.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript, Tailwind CSS utilities, lucide-react icons, existing fetch API wrapper in `packages/web-frontend/lib/api.ts`.

---

## File Structure

- Create `packages/web-frontend/app/workbench/types.ts`: shared frontend-only workbench types.
- Create `packages/web-frontend/app/workbench/workspace-utils.ts`: backend mapping helpers, saved-draft dedupe, copy-text builders, outline grouping.
- Create `packages/web-frontend/app/workbench/use-workspace-autosave.ts`: debounced autosave hook.
- Create `packages/web-frontend/app/workbench/conversation-rail.tsx`: left rail for history, save, autosave state, new conversation, restore, delete.
- Create `packages/web-frontend/app/workbench/idea-composer.tsx`: idea text area and generate-outline action.
- Create `packages/web-frontend/app/workbench/outline-workspace.tsx`: latest batch expanded, older batches collapsed, outline selection and editing.
- Create `packages/web-frontend/app/workbench/post-editor.tsx`: editable final post fields and copy actions.
- Modify `packages/web-frontend/app/page.tsx`: keep auth, state ownership, API calls, component orchestration.
- Modify `packages/web-frontend/app/globals.css`: remove component-specific CSS that the new Tailwind components replace, keep tokens, resets, focus styles, and shared primitive styles.

Backend files should not change for this implementation.

---

### Task 1: Extract Workbench Types and Pure Utilities

**Files:**
- Create: `packages/web-frontend/app/workbench/types.ts`
- Create: `packages/web-frontend/app/workbench/workspace-utils.ts`
- Modify: `packages/web-frontend/app/page.tsx`

- [ ] **Step 1: Create shared types**

Create `packages/web-frontend/app/workbench/types.ts`:

```ts
export type OutlineTone = "guide" | "story" | "checklist";

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
  imagePrompt: string;
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
```

- [ ] **Step 2: Move pure helpers**

Create `packages/web-frontend/app/workbench/workspace-utils.ts` with exported versions of the existing pure helpers from `page.tsx`:

```ts
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

export function mapBackendOutline(outline: BackendOutline, batch: number): Outline {
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
```

- [ ] **Step 3: Update imports in `page.tsx`**

In `packages/web-frontend/app/page.tsx`, remove local type and helper definitions moved in Steps 1-2, then import them:

```ts
import type {
  AutoSaveState,
  ConversationRecord,
  Outline,
  PostDraft,
  SavedDraft,
  Snapshot,
  WorkspaceSnapshot,
} from "./workbench/types";
import {
  DEFAULT_SEED,
  createAutoSaveKey,
  dedupeSavedDrafts,
  formatAutoSaveTime,
  formatRecordTime,
  getDraftSignature,
  getFullPostText,
  groupOutlines,
  mapBackendOutline,
  mapBackendPostDraft,
  mapConversationRecord,
  mapSavedDraft,
  mapWorkspaceSnapshot,
  toneMeta,
} from "./workbench/workspace-utils";
```

Replace the inline `outlineGroups` reducer with the exported helper:

```ts
const outlineGroups = useMemo(() => groupOutlines(outlines), [outlines]);
```

Replace the remaining `getPostText(postDraft)` call with:

```ts
getFullPostText(postDraft)
```

- [ ] **Step 4: Run verification**

Run:

```bash
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm --filter @rednote/web-frontend lint
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm --filter @rednote/web-frontend build
```

Expected:

- `eslint` exits with code 0.
- `next build` exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add packages/web-frontend/app/page.tsx packages/web-frontend/app/workbench/types.ts packages/web-frontend/app/workbench/workspace-utils.ts
git commit -m "refactor: extract workbench utilities"
```

---

### Task 2: Extract Autosave Hook

**Files:**
- Create: `packages/web-frontend/app/workbench/use-workspace-autosave.ts`
- Modify: `packages/web-frontend/app/page.tsx`

- [ ] **Step 1: Create autosave hook**

Create `packages/web-frontend/app/workbench/use-workspace-autosave.ts`:

```ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { api } from "@/lib/api";
import type { AutoSaveState, ConversationRecord, Outline, PostDraft, WorkspaceSnapshot } from "./types";
import {
  DEFAULT_SEED,
  createAutoSaveKey,
  formatAutoSaveTime,
  formatRecordTime,
} from "./workspace-utils";

type UseWorkspaceAutosaveOptions = {
  accessToken: string | null;
  authReady: boolean;
  conversationId: string | null;
  isGenerating: boolean;
  isStartingConversation: boolean;
  postDraft: PostDraft | null;
  seed: string;
  selectedId: string;
  selectedOutline: Outline | undefined;
  statusMessage: string;
  workspaceSnapshot: WorkspaceSnapshot;
  setConversationRecords: Dispatch<SetStateAction<ConversationRecord[]>>;
};

export function useWorkspaceAutosave({
  accessToken,
  authReady,
  conversationId,
  isGenerating,
  isStartingConversation,
  postDraft,
  seed,
  selectedId,
  selectedOutline,
  statusMessage,
  workspaceSnapshot,
  setConversationRecords,
}: UseWorkspaceAutosaveOptions) {
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>("idle");
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState("");
  const autoSaveRunRef = useRef(0);
  const lastAutoSavedKeyRef = useRef("");

  const autoSaveKey = useMemo(
    () => createAutoSaveKey(workspaceSnapshot),
    [workspaceSnapshot],
  );

  const autoSaveLabel = useMemo(() => {
    if (autoSaveState === "saving") return "自动保存中";
    if (autoSaveState === "error") return "自动保存失败";
    if (lastAutoSavedAt) return `已自动保存 ${lastAutoSavedAt}`;
    return "等待自动保存";
  }, [autoSaveState, lastAutoSavedAt]);

  useEffect(() => {
    if (
      !accessToken ||
      !authReady ||
      !conversationId ||
      isGenerating ||
      isStartingConversation ||
      autoSaveKey === lastAutoSavedKeyRef.current
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const runId = autoSaveRunRef.current + 1;
      autoSaveRunRef.current = runId;
      setAutoSaveState("saving");

      const snapshot = workspaceSnapshot;
      const topic = seed.trim();
      const fallbackTitle = topic || selectedOutline?.title || postDraft?.title || "新对话";
      const updateBody: {
        selectedOutlineId?: string;
        statusMessage?: string;
        title?: string;
        topic?: string;
      } = {
        selectedOutlineId: selectedId,
        statusMessage,
        title: postDraft?.title ?? selectedOutline?.title ?? fallbackTitle,
      };

      if (topic) updateBody.topic = topic;

      void (async () => {
        await api.conversations.update(accessToken, conversationId, updateBody);
        const savedSnapshot = await api.conversations.createSnapshot(
          accessToken,
          conversationId,
          { snapshot: snapshot as unknown as Record<string, unknown> },
        );

        if (runId !== autoSaveRunRef.current) return;

        lastAutoSavedKeyRef.current = autoSaveKey;
        setAutoSaveState("saved");
        setLastAutoSavedAt(formatAutoSaveTime(new Date(savedSnapshot.createdAt)));
        setConversationRecords((records) => {
          const record: ConversationRecord = {
            conversationId,
            id: conversationId,
            outlineCount: snapshot.outlines.length,
            savedAt: formatRecordTime(savedSnapshot.createdAt),
            snapshot,
            title: updateBody.title ?? "新对话",
            topic: topic || snapshot.seed || DEFAULT_SEED,
          };

          return [
            record,
            ...records.filter((item) => item.conversationId !== conversationId),
          ].slice(0, 8);
        });
      })().catch(() => {
        if (runId !== autoSaveRunRef.current) return;
        setAutoSaveState("error");
      });
    }, 1400);

    return () => window.clearTimeout(timeoutId);
  }, [
    accessToken,
    authReady,
    autoSaveKey,
    conversationId,
    isGenerating,
    isStartingConversation,
    postDraft?.title,
    seed,
    selectedId,
    selectedOutline?.title,
    statusMessage,
    workspaceSnapshot,
    setConversationRecords,
  ]);

  return {
    autoSaveKey,
    autoSaveLabel,
    autoSaveState,
    lastAutoSavedKeyRef,
    setAutoSaveState,
    setLastAutoSavedAt,
  };
}
```

- [ ] **Step 2: Replace autosave state in `page.tsx`**

Remove these local declarations from `page.tsx`:

```ts
const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>("idle");
const [lastAutoSavedAt, setLastAutoSavedAt] = useState("");
const autoSaveRunRef = useRef(0);
const lastAutoSavedKeyRef = useRef("");
```

Update the React import because `page.tsx` no longer uses `useRef`:

```ts
import { useEffect, useMemo, useState } from "react";
```

Remove `AutoSaveState` from the `./workbench/types` import and remove `formatRecordTime` from the `./workbench/workspace-utils` import.

Import and call the hook after `workspaceSnapshot` and `selectedOutline` are defined:

```ts
import { useWorkspaceAutosave } from "./workbench/use-workspace-autosave";

const {
  autoSaveKey,
  autoSaveLabel,
  autoSaveState,
  lastAutoSavedKeyRef,
  setAutoSaveState,
  setLastAutoSavedAt,
} = useWorkspaceAutosave({
  accessToken,
  authReady: Boolean(authUser),
  conversationId,
  isGenerating,
  isStartingConversation,
  postDraft,
  seed,
  selectedId,
  selectedOutline,
  statusMessage,
  workspaceSnapshot,
  setConversationRecords,
});
```

- [ ] **Step 3: Run verification**

Run:

```bash
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm --filter @rednote/web-frontend lint
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm --filter @rednote/web-frontend build
```

Expected:

- `eslint` exits with code 0.
- `next build` exits with code 0.

- [ ] **Step 4: Commit**

```bash
git add packages/web-frontend/app/page.tsx packages/web-frontend/app/workbench/use-workspace-autosave.ts
git commit -m "refactor: extract workspace autosave hook"
```

---

### Task 3: Build the Conversation Rail

**Files:**
- Create: `packages/web-frontend/app/workbench/conversation-rail.tsx`
- Modify: `packages/web-frontend/app/page.tsx`

- [ ] **Step 1: Create `ConversationRail`**

Create `packages/web-frontend/app/workbench/conversation-rail.tsx`:

```tsx
"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import type { AutoSaveState, ConversationRecord } from "./types";

type ConversationRailProps = {
  activeConversationId: string | null;
  autoSaveLabel: string;
  autoSaveState: AutoSaveState;
  conversations: ConversationRecord[];
  isGenerating: boolean;
  isHistoryReady: boolean;
  isStartingConversation: boolean;
  onCreateConversation: () => void;
  onDeleteConversation: (record: ConversationRecord) => void;
  onRestoreConversation: (record: ConversationRecord) => void;
  onSaveConversation: () => void;
};

export function ConversationRail({
  activeConversationId,
  autoSaveLabel,
  autoSaveState,
  conversations,
  isGenerating,
  isHistoryReady,
  isStartingConversation,
  onCreateConversation,
  onDeleteConversation,
  onRestoreConversation,
  onSaveConversation,
}: ConversationRailProps) {
  const autoSaveTone =
    autoSaveState === "error"
      ? "border-[var(--yellow)] bg-[var(--yellow)] text-[var(--ink)]"
      : autoSaveState === "saved"
        ? "border-[var(--mint)] bg-[var(--mint)] text-[var(--mint-ink)]"
        : "border-[var(--line)] bg-[var(--surface-tint)] text-[var(--ink-soft)]";

  return (
    <aside className="sticky top-4 grid max-h-[calc(100vh-2rem)] w-[248px] shrink-0 grid-rows-[auto_auto_1fr] gap-3 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 font-mono text-xs font-black text-[var(--red)]">对话</p>
          <strong className="block truncate text-sm font-black text-[var(--ink)]">
            当前创作
          </strong>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            aria-label={isStartingConversation ? "新建对话中" : "新增对话"}
            className="grid size-9 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface-tint)] text-[var(--ink)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)] hover:text-[var(--red-strong)]"
            disabled={!isHistoryReady || isStartingConversation || isGenerating}
            onClick={onCreateConversation}
            title={isStartingConversation ? "新建中" : "新增对话"}
            type="button"
          >
            <Plus aria-hidden="true" size={16} strokeWidth={2.4} />
          </button>
          <button
            aria-label="立即保存"
            className="grid size-9 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface-tint)] text-[var(--ink)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)] hover:text-[var(--red-strong)]"
            disabled={!isHistoryReady}
            onClick={onSaveConversation}
            title="立即保存"
            type="button"
          >
            <Save aria-hidden="true" size={16} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <div className={`rounded-md border px-2.5 py-2 text-xs font-black ${autoSaveTone}`}>
        {autoSaveLabel}
      </div>

      <div className="min-h-0 overflow-y-auto pr-1">
        {conversations.length ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {conversations.map((record) => {
              const isActive = record.conversationId === activeConversationId;

              return (
                <li className="grid grid-cols-[minmax(0,1fr)_36px] gap-1.5" key={record.id}>
                  <button
                    aria-current={isActive ? "true" : undefined}
                    className={`grid min-w-0 gap-1 rounded-md border p-2 text-left transition ${
                      isActive
                        ? "border-[var(--red)] bg-[var(--red-soft)]"
                        : "border-transparent bg-[var(--surface-tint)] hover:border-[var(--line)]"
                    }`}
                    onClick={() => onRestoreConversation(record)}
                    type="button"
                  >
                    <span className="text-xs font-black text-[var(--muted)]">
                      {record.savedAt}
                    </span>
                    <strong className="truncate text-sm font-black text-[var(--ink)]">
                      {record.title}
                    </strong>
                    <small className="truncate text-xs font-bold text-[var(--ink-soft)]">
                      {record.outlineCount} 个大纲
                    </small>
                  </button>
                  <button
                    aria-label={`删除记录：${record.title}`}
                    className="grid size-9 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--red-strong)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)]"
                    onClick={() => onDeleteConversation(record)}
                    title="删除"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} strokeWidth={2.3} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 rounded-md bg-[var(--surface-tint)] p-3 text-sm leading-6 text-[var(--ink-soft)]">
            还没有记录，输入想法后会自动保存。
          </p>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Replace history panel in `page.tsx`**

In `page.tsx`, add the component import with the other local workbench imports:

```ts
import { ConversationRail } from "./workbench/conversation-rail";
```

Remove this import from `page.tsx`, because the icons move into `conversation-rail.tsx`:

```ts
import { Plus, Save, Trash2 } from "lucide-react";
```

Then remove the inline block whose root element is:

```tsx
<section className="history-panel" aria-labelledby="history-title">
```

Delete that entire `history-panel` section, ending at its matching `</section>`.

After deleting the block, insert `ConversationRail` as the first child inside the existing `<section className="workspace-grid">`:

```tsx
<section className="workspace-grid">
  <ConversationRail
    activeConversationId={conversationId}
    autoSaveLabel={autoSaveLabel}
    autoSaveState={autoSaveState}
    conversations={conversationRecords}
    isGenerating={isGenerating}
    isHistoryReady={isHistoryReady}
    isStartingConversation={isStartingConversation}
    onCreateConversation={() => void startNewConversation()}
    onDeleteConversation={(record) => void deleteConversationRecord(record)}
    onRestoreConversation={(record) => void restoreConversationRecord(record)}
    onSaveConversation={() => void saveConversationRecord()}
  />
```

- [ ] **Step 3: Run verification**

Run:

```bash
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm --filter @rednote/web-frontend lint
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm --filter @rednote/web-frontend build
```

Expected:

- `eslint` exits with code 0.
- `next build` exits with code 0.

- [ ] **Step 4: Commit**

```bash
git add packages/web-frontend/app/page.tsx packages/web-frontend/app/workbench/conversation-rail.tsx
git commit -m "feat: add conversation rail"
```

---

### Task 4: Build Idea and Outline Workbench Components

**Files:**
- Create: `packages/web-frontend/app/workbench/idea-composer.tsx`
- Create: `packages/web-frontend/app/workbench/outline-workspace.tsx`
- Modify: `packages/web-frontend/app/page.tsx`

- [ ] **Step 1: Create `IdeaComposer`**

Create `packages/web-frontend/app/workbench/idea-composer.tsx`:

```tsx
"use client";

type IdeaComposerProps = {
  briefError: string;
  isGenerating: boolean;
  isStartingConversation: boolean;
  onGenerate: () => void;
  onSeedChange: (value: string) => void;
  seed: string;
};

export function IdeaComposer({
  briefError,
  isGenerating,
  isStartingConversation,
  onGenerate,
  onSeedChange,
  seed,
}: IdeaComposerProps) {
  return (
    <section className="grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="grid gap-1">
        <p className="m-0 font-mono text-xs font-black text-[var(--red)]">想法</p>
        <h2 className="m-0 text-lg font-black text-[var(--ink)]">输入一句内容方向</h2>
      </div>
      <label className="grid gap-2">
        <span className="text-sm font-black text-[var(--mint-ink)]">主题</span>
        <textarea
          aria-describedby={briefError ? "brief-error" : undefined}
          aria-invalid={Boolean(briefError)}
          className="min-h-28 resize-y rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 leading-7 text-[var(--ink)] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          onChange={(event) => onSeedChange(event.target.value)}
          placeholder="例如：新手如何把出租屋阳台改成早餐角"
          value={seed}
        />
        {briefError ? (
          <small className="text-sm font-bold text-[var(--red-strong)]" id="brief-error">
            {briefError}
          </small>
        ) : null}
      </label>
      <button
        className="min-h-11 rounded-md bg-[var(--red)] px-4 font-black text-[var(--surface)] transition hover:bg-[var(--red-strong)] disabled:opacity-50"
        disabled={isGenerating || isStartingConversation}
        onClick={onGenerate}
        type="button"
      >
        {isGenerating ? "生成中" : "生成大纲"}
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Create `OutlineWorkspace`**

Create `packages/web-frontend/app/workbench/outline-workspace.tsx`:

```tsx
"use client";

import type { Outline, OutlineGroup } from "./types";
import { toneMeta } from "./workspace-utils";

type OutlineWorkspaceProps = {
  draftStale: boolean;
  isGenerating: boolean;
  latestBatch: number;
  onConfirmOutline: () => void;
  onRegenerate: () => void;
  onSelectOutline: (outline: Outline) => void;
  onUpdateOutline: (id: string, patch: Partial<Outline>) => void;
  outlineGroups: OutlineGroup[];
  selectedId: string;
  selectedOutline: Outline | undefined;
};

export function OutlineWorkspace({
  draftStale,
  isGenerating,
  latestBatch,
  onConfirmOutline,
  onRegenerate,
  onSelectOutline,
  onUpdateOutline,
  outlineGroups,
  selectedId,
  selectedOutline,
}: OutlineWorkspaceProps) {
  return (
    <section className="grid gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 font-mono text-xs font-black text-[var(--red)]">大纲</p>
          <h2 className="m-0 text-lg font-black text-[var(--ink)]">选择并调整方向</h2>
        </div>
        <button
          className="min-h-9 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 font-black text-[var(--ink)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)] disabled:opacity-50"
          disabled={isGenerating}
          onClick={onRegenerate}
          type="button"
        >
          {isGenerating ? "生成中" : "换一批"}
        </button>
      </div>

      <div className="grid gap-3">
        {outlineGroups.map((group) => {
          const isLatest = group.batch === latestBatch;

          return (
            <details className="rounded-md border border-[var(--line)]" key={group.batch} open={isLatest}>
              <summary className="cursor-pointer px-3 py-2 text-sm font-black text-[var(--red-strong)]">
                {isLatest ? "最新一批" : `第 ${group.batch + 1} 批`}，{group.outlines.length} 个方向
              </summary>
              <div className="grid gap-2 p-3 md:grid-cols-3">
                {group.outlines.map((outline) => {
                  const meta = toneMeta[outline.tone];
                  const isSelected = outline.id === selectedId;

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`grid min-h-44 content-start gap-2 rounded-md border p-3 text-left transition ${
                        isSelected
                          ? "border-[var(--red)] bg-[var(--red-soft)]"
                          : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--red)]"
                      }`}
                      key={outline.id}
                      onClick={() => onSelectOutline(outline)}
                      type="button"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <strong className="text-sm font-black text-[var(--red)]">{meta.mark}</strong>
                        <em className="rounded px-2 py-1 text-xs font-black not-italic text-[var(--red-strong)]">
                          {outline.label}
                        </em>
                      </span>
                      <span className="font-black leading-6 text-[var(--ink)]">{outline.title}</span>
                      <span className="text-sm leading-6 text-[var(--ink-soft)]">{outline.hook}</span>
                    </button>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      {selectedOutline ? (
        <article className="grid gap-3 rounded-md bg-[var(--surface-tint)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-[var(--muted)]">正在编辑</span>
              <strong className="block text-sm font-black text-[var(--red)]">
                {toneMeta[selectedOutline.tone].name}
              </strong>
            </div>
            <button
              className="min-h-9 rounded-md bg-[var(--red)] px-3 font-black text-[var(--surface)] transition hover:bg-[var(--red-strong)] disabled:opacity-50"
              disabled={isGenerating}
              onClick={onConfirmOutline}
              type="button"
            >
              {isGenerating ? "生成中" : draftStale ? "刷新图文" : "生成图文"}
            </button>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-black text-[var(--mint-ink)]">标题</span>
            <input
              className="min-h-10 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 font-bold text-[var(--ink)]"
              onChange={(event) => onUpdateOutline(selectedOutline.id, { title: event.target.value })}
              value={selectedOutline.title}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-black text-[var(--mint-ink)]">开场钩子</span>
            <textarea
              className="min-h-20 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 leading-7 text-[var(--ink)]"
              onChange={(event) => onUpdateOutline(selectedOutline.id, { hook: event.target.value })}
              value={selectedOutline.hook}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-black text-[var(--mint-ink)]">内容结构</span>
            <textarea
              className="min-h-32 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 leading-7 text-[var(--ink)]"
              onChange={(event) =>
                onUpdateOutline(selectedOutline.id, {
                  points: event.target.value
                    .split("\n")
                    .map((point) => point.trim())
                    .filter(Boolean),
                })
              }
              value={selectedOutline.points.join("\n")}
            />
          </label>
        </article>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 3: Wire both components in `page.tsx`**

Add these imports:

```ts
import { IdeaComposer } from "./workbench/idea-composer";
import { OutlineWorkspace } from "./workbench/outline-workspace";
```

Replace the current idea input panel and outline panel markup with:

```tsx
<IdeaComposer
  briefError={briefError}
  isGenerating={isGenerating}
  isStartingConversation={isStartingConversation}
  onGenerate={() => void appendOutlineBatch()}
  onSeedChange={(value) => {
    setSeed(value);
    if (value.trim()) setBriefError("");
    if (postDraft) setDraftStale(true);
    setStatusMessage("主题已更新，重新生成大纲后生效。");
  }}
  seed={seed}
/>
<OutlineWorkspace
  draftStale={draftStale}
  isGenerating={isGenerating}
  latestBatch={latestBatch}
  onConfirmOutline={() => void confirmOutline()}
  onRegenerate={regenerateOutlines}
  onSelectOutline={(outline) => {
    setSelectedId(outline.id);
    if (postDraft) setDraftStale(true);
    setStatusMessage(`已选择「${toneMeta[outline.tone].name}」。`);
    if (accessToken && conversationId) {
      void api.conversations
        .update(accessToken, conversationId, { selectedOutlineId: outline.id })
        .catch(() => {});
    }
  }}
  onUpdateOutline={updateOutline}
  outlineGroups={outlineGroups}
  selectedId={selectedId}
  selectedOutline={selectedOutline}
/>
```

- [ ] **Step 4: Run verification**

Run:

```bash
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm --filter @rednote/web-frontend lint
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm --filter @rednote/web-frontend build
```

Expected:

- `eslint` exits with code 0.
- `next build` exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add packages/web-frontend/app/page.tsx packages/web-frontend/app/workbench/idea-composer.tsx packages/web-frontend/app/workbench/outline-workspace.tsx
git commit -m "feat: add focused idea and outline workspaces"
```

---

### Task 5: Build Editable Post Editor

**Files:**
- Create: `packages/web-frontend/app/workbench/post-editor.tsx`
- Modify: `packages/web-frontend/app/page.tsx`
- Modify: `packages/web-frontend/lib/api.ts`

- [ ] **Step 1: Confirm API update method exists**

Check `packages/web-frontend/lib/api.ts` includes:

```ts
postDrafts: {
  update: (
    token: string,
    postDraftId: string,
    body: {
      caption?: string;
      coverLine?: string;
      imagePrompt?: string;
      sections?: string[];
      tags?: string[];
      title?: string;
    },
  ) =>
    request<BackendPostDraft>(`/post-drafts/${postDraftId}`, {
      body,
      method: "PATCH",
      token,
    }),
},
```

Expected: the method already exists. No change is needed if this block is present.

- [ ] **Step 2: Create `PostEditor`**

Create `packages/web-frontend/app/workbench/post-editor.tsx`:

```tsx
"use client";

import type { PostDraft, SavedDraft } from "./types";
import { getFullPostText, getPostBodyText } from "./workspace-utils";

type PostEditorProps = {
  draftStale: boolean;
  isGenerating: boolean;
  isSavingDraft: boolean;
  onCopy: (text: string, label: string) => void;
  onDraftChange: (patch: Partial<PostDraft>) => void;
  onOpenSavedDraft: (draft: SavedDraft) => void;
  onRefresh: () => void;
  onSaveDraft: () => void;
  postDraft: PostDraft | null;
  savedDrafts: SavedDraft[];
  selectedTitle?: string;
};

export function PostEditor({
  draftStale,
  isGenerating,
  isSavingDraft,
  onCopy,
  onDraftChange,
  onOpenSavedDraft,
  onRefresh,
  onSaveDraft,
  postDraft,
  savedDrafts,
  selectedTitle,
}: PostEditorProps) {
  const sectionsText = postDraft?.sections.join("\n") ?? "";
  const tagsText = postDraft?.tags.join(" ") ?? "";

  return (
    <section className="grid gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 font-mono text-xs font-black text-[var(--red)]">图文</p>
          <h2 className="m-0 text-lg font-black text-[var(--ink)]">编辑最终发布内容</h2>
        </div>
        {postDraft ? (
          <span className={`rounded px-2.5 py-1.5 text-xs font-black ${
            draftStale ? "bg-[var(--yellow)] text-[var(--ink)]" : "bg-[var(--red-soft)] text-[var(--red-strong)]"
          }`}>
            {draftStale ? "待刷新" : "已生成"}
          </span>
        ) : null}
      </div>

      {postDraft ? (
        <>
          <div className="grid gap-3">
            <label className="grid gap-2">
              <span className="text-sm font-black text-[var(--mint-ink)]">标题</span>
              <input
                className="min-h-10 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 font-bold text-[var(--ink)]"
                onChange={(event) => onDraftChange({ title: event.target.value })}
                value={postDraft.title}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-black text-[var(--mint-ink)]">封面文案</span>
              <input
                className="min-h-10 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 font-bold text-[var(--ink)]"
                onChange={(event) => onDraftChange({ coverLine: event.target.value })}
                value={postDraft.coverLine}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-black text-[var(--mint-ink)]">正文开场</span>
              <textarea
                className="min-h-24 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 leading-7 text-[var(--ink)]"
                onChange={(event) => onDraftChange({ caption: event.target.value })}
                value={postDraft.caption}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-black text-[var(--mint-ink)]">正文结构</span>
              <textarea
                className="min-h-36 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 leading-7 text-[var(--ink)]"
                onChange={(event) =>
                  onDraftChange({
                    sections: event.target.value
                      .split("\n")
                      .map((section) => section.trim())
                      .filter(Boolean),
                  })
                }
                value={sectionsText}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-black text-[var(--mint-ink)]">标签</span>
              <input
                className="min-h-10 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 font-bold text-[var(--ink)]"
                onChange={(event) =>
                  onDraftChange({
                    tags: event.target.value
                      .split(/\s+/)
                      .map((tag) => tag.replace(/^#/, "").trim())
                      .filter(Boolean),
                  })
                }
                value={tagsText}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-black text-[var(--mint-ink)]">封面提示</span>
              <textarea
                className="min-h-24 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 leading-7 text-[var(--ink)]"
                onChange={(event) => onDraftChange({ imagePrompt: event.target.value })}
                value={postDraft.imagePrompt}
              />
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <button className="min-h-10 rounded-md bg-[var(--red)] px-3 font-black text-[var(--surface)]" onClick={() => onCopy(getFullPostText(postDraft), "完整笔记")} type="button">
              复制完整笔记
            </button>
            <button className="min-h-10 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 font-black text-[var(--ink)]" onClick={() => onCopy(postDraft.title, "标题")} type="button">
              复制标题
            </button>
            <button className="min-h-10 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 font-black text-[var(--ink)]" onClick={() => onCopy(postDraft.coverLine, "封面文案")} type="button">
              复制封面文案
            </button>
            <button className="min-h-10 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 font-black text-[var(--ink)]" onClick={() => onCopy(getPostBodyText(postDraft), "正文")} type="button">
              复制正文
            </button>
            <button className="min-h-10 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 font-black text-[var(--ink)]" onClick={() => onCopy(postDraft.tags.map((tag) => `#${tag}`).join(" "), "标签")} type="button">
              复制标签
            </button>
            <button className="min-h-10 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 font-black text-[var(--ink)]" onClick={() => onCopy(postDraft.imagePrompt, "封面提示")} type="button">
              复制封面提示
            </button>
            <button className="min-h-10 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 font-black text-[var(--ink)] disabled:opacity-50" disabled={isSavingDraft} onClick={onSaveDraft} type="button">
              {isSavingDraft ? "保存中" : "保存草稿"}
            </button>
            {draftStale ? (
              <button className="min-h-10 rounded-md border border-[var(--line)] bg-[var(--yellow)] px-3 font-black text-[var(--ink)] disabled:opacity-50" disabled={isGenerating} onClick={onRefresh} type="button">
                刷新图文
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="grid min-h-56 place-items-center rounded-md border border-dashed border-[var(--line)] bg-[var(--surface-tint)] p-6 text-center">
          <div className="grid gap-2">
            <span className="text-sm font-black text-[var(--red)]">等待图文</span>
            <strong className="text-lg font-black text-[var(--ink)]">
              {selectedTitle ?? "先选择一个大纲"}
            </strong>
          </div>
        </div>
      )}

      {savedDrafts.length ? (
        <div className="grid gap-2">
          <span className="text-sm font-black text-[var(--mint-ink)]">已保存草稿</span>
          {savedDrafts.map((draft) => (
            <button
              className="grid min-h-10 grid-cols-[48px_minmax(0,1fr)] items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-2 text-left text-sm font-bold text-[var(--ink)]"
              key={`${draft.savedDraftId}-${draft.savedAt}`}
              onClick={() => onOpenSavedDraft(draft)}
              type="button"
            >
              <span className="font-mono text-xs text-[var(--red-strong)]">{draft.savedAt}</span>
              <span className="truncate">{draft.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 3: Add draft update handler in `page.tsx`**

Add this function near `saveDraft`:

```ts
function updatePostDraft(patch: Partial<PostDraft>) {
  setPostDraft((draft) => (draft ? { ...draft, ...patch } : draft));
  setDraftStale(false);

  if (!accessToken || !postDraft) return;

  void api.postDrafts.update(accessToken, postDraft.id, patch).catch(() => {});
}

function openSavedDraft(draft: SavedDraft) {
  setPostDraft(draft);
  setDraftStale(false);
  setStatusMessage(`已打开 ${draft.savedAt} 保存的草稿。`);
}
```

- [ ] **Step 4: Render `PostEditor`**

Add this import:

```ts
import { PostEditor } from "./workbench/post-editor";
```

Replace the existing post preview panel with:

```tsx
<PostEditor
  draftStale={draftStale}
  isGenerating={isGenerating}
  isSavingDraft={isSavingDraft}
  onCopy={(text, label) => void copyText(text, label)}
  onDraftChange={updatePostDraft}
  onOpenSavedDraft={openSavedDraft}
  onRefresh={() => void confirmOutline()}
  onSaveDraft={() => void saveDraft()}
  postDraft={postDraft}
  savedDrafts={savedDrafts}
  selectedTitle={selectedOutline?.title}
/>
```

- [ ] **Step 5: Run verification**

Run:

```bash
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm --filter @rednote/web-frontend lint
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm --filter @rednote/web-frontend build
```

Expected:

- `eslint` exits with code 0.
- `next build` exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add packages/web-frontend/app/page.tsx packages/web-frontend/app/workbench/post-editor.tsx packages/web-frontend/lib/api.ts
git commit -m "feat: add editable post editor"
```

---

### Task 6: Recompose Page Layout and Remove Main-Flow Distractions

**Files:**
- Modify: `packages/web-frontend/app/page.tsx`
- Modify: `packages/web-frontend/app/globals.css`

- [ ] **Step 1: Replace the authenticated layout**

Remove this derived value because the new layout does not render the old step rail:

```ts
const currentStep = postDraft ? 3 : selectedOutline ? 2 : 1;
```

In `page.tsx`, make the authenticated return shape match this structure:

```tsx
return (
  <main className="min-h-screen bg-[var(--canvas)] p-4 text-[var(--ink)]">
    <section className="mx-auto grid max-w-[1480px] gap-4">
      <header className="grid gap-3 rounded-lg border border-[var(--red-soft)] bg-[var(--surface)] p-4 md:grid-cols-[248px_minmax(0,1fr)_auto] md:items-center">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-[var(--red)] font-mono font-black text-[var(--surface)]">
            R
          </span>
          <div className="min-w-0">
            <strong className="block truncate font-black">RedNote 内容工坊</strong>
            <small className="font-bold text-[var(--red-strong)]">大纲到图文</small>
          </div>
        </div>
        <div className="min-w-0">
          <p className="m-0 font-mono text-xs font-black text-[var(--red)]">创作台</p>
          <h1 className="m-0 text-2xl font-black leading-tight text-[var(--ink)]">
            一句话生成可发布图文笔记
          </h1>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-2 py-1">
          <span className="grid size-6 place-items-center rounded bg-[var(--red)] text-xs font-black text-[var(--surface)]">
            {authUser.name.slice(0, 1).toUpperCase()}
          </span>
          <strong className="max-w-32 truncate text-sm font-black">{authUser.name}</strong>
          <button
            className="rounded bg-[var(--surface)] px-2 py-1 text-xs font-black text-[var(--red-strong)]"
            onClick={logout}
            type="button"
          >
            退出
          </button>
        </div>
      </header>

      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-bold text-[var(--ink-soft)]" role="status">
        <span className="min-w-0 truncate">{statusMessage}</span>
        {lastSnapshot ? (
          <button
            className="rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 py-1 font-black text-[var(--red-strong)]"
            onClick={undoBatch}
            type="button"
          >
            撤销新增
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
        <ConversationRail
          activeConversationId={conversationId}
          autoSaveLabel={autoSaveLabel}
          autoSaveState={autoSaveState}
          conversations={conversationRecords}
          isGenerating={isGenerating}
          isHistoryReady={isHistoryReady}
          isStartingConversation={isStartingConversation}
          onCreateConversation={() => void startNewConversation()}
          onDeleteConversation={(record) => void deleteConversationRecord(record)}
          onRestoreConversation={(record) => void restoreConversationRecord(record)}
          onSaveConversation={() => void saveConversationRecord()}
        />
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid gap-4">
            <IdeaComposer
              briefError={briefError}
              isGenerating={isGenerating}
              isStartingConversation={isStartingConversation}
              onGenerate={() => void appendOutlineBatch()}
              onSeedChange={(value) => {
                setSeed(value);
                if (value.trim()) setBriefError("");
                if (postDraft) setDraftStale(true);
                setStatusMessage("主题已更新，重新生成大纲后生效。");
              }}
              seed={seed}
            />
            <OutlineWorkspace
              draftStale={draftStale}
              isGenerating={isGenerating}
              latestBatch={latestBatch}
              onConfirmOutline={() => void confirmOutline()}
              onRegenerate={regenerateOutlines}
              onSelectOutline={(outline) => {
                setSelectedId(outline.id);
                if (postDraft) setDraftStale(true);
                setStatusMessage(`已选择「${toneMeta[outline.tone].name}」。`);
                if (accessToken && conversationId) {
                  void api.conversations
                    .update(accessToken, conversationId, { selectedOutlineId: outline.id })
                    .catch(() => {});
                }
              }}
              onUpdateOutline={updateOutline}
              outlineGroups={outlineGroups}
              selectedId={selectedId}
              selectedOutline={selectedOutline}
            />
          </div>
          <PostEditor
            draftStale={draftStale}
            isGenerating={isGenerating}
            isSavingDraft={isSavingDraft}
            onCopy={(text, label) => void copyText(text, label)}
            onDraftChange={updatePostDraft}
            onOpenSavedDraft={openSavedDraft}
            onRefresh={() => void confirmOutline()}
            onSaveDraft={() => void saveDraft()}
            postDraft={postDraft}
            savedDrafts={savedDrafts}
            selectedTitle={selectedOutline?.title}
          />
        </div>
      </div>
    </section>
  </main>
);
```

- [ ] **Step 2: Empty initial workspace behavior**

In `createInitialWorkspace`, stop generating default outlines. Replace the function with:

```ts
async function createInitialWorkspace(token: string) {
  const conversation = await api.conversations.create(token, {
    title: "新对话",
    topic: DEFAULT_SEED,
  });

  applyConversation(conversation, {
    message: "写下一句想法后生成大纲。",
  });
  setSeed("");
  setOutlines([]);
  setSelectedId("");
  await refreshConversationRecords(token);
}
```

This uses `DEFAULT_SEED` only to satisfy the backend create DTO. The visible idea input is empty.

- [ ] **Step 3: Remove replaced global component CSS**

In `packages/web-frontend/app/globals.css`, keep:

- `@import "tailwindcss";`
- `:root` tokens.
- `@theme inline`.
- Global reset selectors for `*`, `html`, `body`, `button`, `input`, `textarea`, focus-visible, disabled.
- Login page styles until login is also rewritten.
- `@media (prefers-reduced-motion: reduce)`.

Remove CSS blocks that are no longer used by the authenticated workbench:

- `.studio-shell`
- `.studio-top`
- `.workspace-grid`
- `.brief-panel`
- `.outline-panel`
- `.post-panel`
- `.history-*`
- `.outline-*`
- `.post-*`
- `.phone-frame`
- `.cover-*`
- `.image-brief`
- `.saved-*`

After removing, run:

```bash
rg -n "studio-shell|workspace-grid|brief-panel|outline-panel|post-panel|history-|phone-frame|cover-art|image-brief|saved-draft" packages/web-frontend/app
```

Expected: no matches in authenticated workbench code.

- [ ] **Step 4: Run verification**

Run:

```bash
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm --filter @rednote/web-frontend lint
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm --filter @rednote/web-frontend build
```

Expected:

- `eslint` exits with code 0.
- `next build` exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add packages/web-frontend/app/page.tsx packages/web-frontend/app/globals.css
git commit -m "feat: recompose rednote workbench layout"
```

---

### Task 7: Manual Runtime Verification

**Files:**
- No file edits.

- [ ] **Step 1: Start full dev server**

Run:

```bash
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm dev
```

Expected:

- Frontend logs `Local: http://localhost:3000`.
- Backend logs `Found 0 errors`.
- Backend logs `Nest application successfully started`.

- [ ] **Step 2: Check frontend response**

In another shell, run:

```bash
curl -I http://localhost:3000
```

Expected:

- `HTTP/1.1 200 OK`
- `Content-Type: text/html; charset=utf-8`

- [ ] **Step 3: Manual browser checks**

Open `http://localhost:3000` and verify:

- Login screen loads.
- Demo login enters workbench.
- Left rail stays narrow.
- New conversation clears the visible idea input.
- Manual save stays in rail.
- Generate outline creates three latest outlines.
- Older batches collapse after generating another batch.
- Selecting and editing an outline marks existing draft stale.
- Generate final content shows editable fields.
- Full note copy includes title, body, and tags.
- Field-level copy works for title, cover line, body, tags, and cover prompt.
- Saving the same draft twice shows the duplicate message.
- Refresh restores autosaved workspace state.

- [ ] **Step 4: Stop dev server**

Stop the running `pnpm dev` process with Ctrl-C.

Expected:

- Backend and frontend processes exit.
- No dev server session remains running.

---

### Task 8: Impeccable Review and Final Commit

**Files:**
- Modify only files needed to fix review findings.

- [ ] **Step 1: Run impeccable review**

Use `$impeccable` on the frontend workbench after implementation. Review criteria:

- Main workflow is visually dominant: idea, outlines, final post.
- Conversation rail does not compete with the main workbench.
- Buttons are not duplicated.
- Tooltip or icon affordances do not overlap.
- Text fits in narrow and desktop layouts.
- Tailwind utility classes carry the new workbench layout.
- Global CSS is not growing with one-off component blocks.

- [ ] **Step 2: Fix concrete review findings**

For each finding, edit the exact affected component or CSS file. Run:

```bash
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm --filter @rednote/web-frontend lint
PATH=/Users/szw/.nvm/versions/node/v24.13.0/bin:$PATH pnpm --filter @rednote/web-frontend build
```

Expected:

- `eslint` exits with code 0.
- `next build` exits with code 0.

- [ ] **Step 3: Commit review fixes**

If review produced code changes, commit them:

```bash
git add packages/web-frontend/app
git commit -m "fix: polish rednote workbench review findings"
```

If review produced no code changes, do not create an empty commit.

- [ ] **Step 4: Final status**

Run:

```bash
git status --short
```

Expected:

- No output.

Then push the completed branch:

```bash
git push origin dev
```

Expected:

- Remote `dev` updates successfully.
