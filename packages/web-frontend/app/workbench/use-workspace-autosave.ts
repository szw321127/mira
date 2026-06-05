"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { api } from "@/lib/api";
import type {
  AutoSaveState,
  ConversationRecord,
  Outline,
  PostDraft,
  WorkspaceSnapshot,
} from "./types";
import {
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
        topic,
      };

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
            topic: topic || snapshot.seed || "",
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
