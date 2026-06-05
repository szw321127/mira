"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  apiClient,
  getApiErrorMessage,
  type AuthResponse,
  type AuthUser,
  type BackendConversation,
} from "@/lib/api";
import type {
  ConversationRecord,
  Outline,
  PostDraft,
  SavedDraft,
  Snapshot,
  WorkspaceSnapshot,
} from "./workbench/types";
import {
  createAutoSaveKey,
  dedupeSavedDrafts,
  formatAutoSaveTime,
  getDraftSignature,
  groupOutlines,
  mapBackendOutline,
  mapBackendPostDraft,
  mapConversationRecord,
  mapSavedDraft,
  mapWorkspaceSnapshot,
  toneMeta,
} from "./workbench/workspace-utils";
import { useWorkspaceAutosave } from "./workbench/use-workspace-autosave";
import { ConversationRail } from "./workbench/conversation-rail";
import { IdeaComposer } from "./workbench/idea-composer";
import { OutlineWorkspace } from "./workbench/outline-workspace";
import { PostEditor } from "./workbench/post-editor";

type AuthMode = "login" | "register";

type AuthSession = {
  accessToken: string;
  user: AuthUser;
};

type PostDraftPatch = Partial<
  Pick<
    PostDraft,
    "caption" | "coverLine" | "imagePrompt" | "sections" | "tags" | "title"
  >
>;

type PostDraftPatchInFlight = {
  draftId: string;
  patch: PostDraftPatch;
  promise: Promise<void>;
  sequence: number;
};

const AUTH_STORAGE_KEY = "rednote:auth-session";
const POST_DRAFT_UPDATE_DEBOUNCE_MS = 500;

function getWorkspaceErrorMessage(error: unknown, fallback: string) {
  const detail = getApiErrorMessage(error);

  if (!detail || detail === "请求失败，请稍后重试。") return fallback;
  if (detail === fallback) return fallback;

  return `${fallback}（${detail}）`;
}

function mergePostDraftImageFields(current: PostDraft, next: PostDraft): PostDraft {
  return {
    ...current,
    imageError: next.imageError,
    imageGeneratedAt: next.imageGeneratedAt,
    imageProvider: next.imageProvider,
    imageStatus: next.imageStatus,
    imageUrl: next.imageUrl,
  };
}

export default function Home() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [loginAccount, setLoginAccount] = useState("creator@rednote.local");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [seed, setSeed] = useState("");
  const [batch, setBatch] = useState(-1);
  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [postDraft, setPostDraft] = useState<PostDraft | null>(null);
  const [draftStale, setDraftStale] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [conversationRecords, setConversationRecords] = useState<ConversationRecord[]>([]);
  const [isHistoryReady, setIsHistoryReady] = useState(false);
  const [isStartingConversation, setIsStartingConversation] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<Snapshot | null>(null);
  const [statusMessage, setStatusMessage] = useState("正在连接后端工作台。");
  const currentPostDraftIdRef = useRef<string | null>(null);
  const pendingPostDraftIdRef = useRef<string | null>(null);
  const pendingPostDraftPatchRef = useRef<PostDraftPatch | null>(null);
  const postDraftPatchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const postDraftPatchInFlightRef = useRef<PostDraftPatchInFlight | null>(null);
  const postDraftPatchSequenceRef = useRef(0);

  useEffect(() => {
    return apiClient.interceptors.error.use((error) => {
      if (error.code === 401 && accessToken) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        setAccessToken(null);
        setAuthUser(null);
        setConversationId(null);
        setStatusMessage("登录已过期，请重新登录。");
        return;
      }

      if (authUser && !postDraftPatchInFlightRef.current) {
        setStatusMessage(error.message);
      }
    });
  }, [accessToken, authUser]);

  useEffect(() => {
    return () => {
      clearPostDraftPatchTimeout();
    };
  }, []);

  useEffect(() => {
    currentPostDraftIdRef.current = postDraft?.id ?? null;
    clearPostDraftPatchTimeout();
    pendingPostDraftIdRef.current = null;
    pendingPostDraftPatchRef.current = null;
    postDraftPatchSequenceRef.current += 1;
  }, [postDraft?.id]);

  const latestBatch = useMemo(
    () => (outlines.length ? Math.max(...outlines.map((outline) => outline.batch)) : -1),
    [outlines],
  );

  const outlineGroups = useMemo(() => groupOutlines(outlines), [outlines]);

  const selectedOutline = useMemo(
    () => outlines.find((outline) => outline.id === selectedId) ?? outlines[0],
    [outlines, selectedId],
  );

  const workspaceSnapshot = useMemo<WorkspaceSnapshot>(
    () => ({
      batch,
      briefError,
      draftStale,
      lastSnapshot,
      outlines,
      postDraft,
      savedDrafts,
      seed,
      selectedId,
      statusMessage,
    }),
    [
      batch,
      briefError,
      draftStale,
      lastSnapshot,
      outlines,
      postDraft,
      savedDrafts,
      seed,
      selectedId,
      statusMessage,
    ],
  );

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
    isGenerating: isGenerating || isGeneratingImage,
    isStartingConversation,
    postDraft,
    seed,
    selectedId,
    selectedOutline,
    statusMessage,
    workspaceSnapshot,
    setConversationRecords,
  });

  function applyConversation(
    conversation: BackendConversation,
    options: {
      keepLastSnapshot?: boolean;
      message?: string;
      preferSnapshot?: boolean;
    } = {},
  ) {
    if (options.preferSnapshot) {
      const latestSnapshot = conversation.snapshots[0];
      const mappedSnapshot = latestSnapshot
        ? mapWorkspaceSnapshot(latestSnapshot.snapshot)
        : null;

      if (mappedSnapshot) {
        setConversationId(conversation.id);
        applyWorkspaceSnapshot(
          mappedSnapshot,
          options.message ?? "已从自动保存恢复当前工作状态。",
        );
        setLastAutoSavedAt(formatAutoSaveTime(new Date(latestSnapshot.createdAt)));
        return;
      }
    }

    const nextOutlines = conversation.outlineBatches.flatMap((outlineBatch) =>
      outlineBatch.outlines.map((outline) =>
        mapBackendOutline(outline, outlineBatch.batchNo),
      ),
    );
    const nextPostDraft = conversation.currentPostDraft
      ? mapBackendPostDraft(conversation.currentPostDraft)
      : null;
    const nextSavedDrafts = dedupeSavedDrafts(
      conversation.savedDrafts
        .map((savedDraft) => mapSavedDraft(savedDraft))
        .filter((savedDraft): savedDraft is SavedDraft => Boolean(savedDraft)),
    );

    setBatch(
      nextOutlines.length
        ? Math.max(...nextOutlines.map((outline) => outline.batch))
        : -1,
    );
    setBriefError("");
    setConversationId(conversation.id);
    setDraftStale(Boolean(nextPostDraft?.stale));
    if (!options.keepLastSnapshot) setLastSnapshot(null);
    setOutlines(nextOutlines);
    setPostDraft(nextPostDraft);
    setSavedDrafts(nextSavedDrafts);
    setSeed(conversation.topic ?? "");
    setSelectedId(conversation.selectedOutlineId ?? nextOutlines[0]?.id ?? "");
    setStatusMessage(
      options.message ??
        conversation.statusMessage ??
        "已从后端恢复当前工作状态。",
    );
  }

  function applyWorkspaceSnapshot(snapshot: WorkspaceSnapshot, message: string) {
    setBatch(snapshot.batch);
    setBriefError(snapshot.briefError);
    setDraftStale(snapshot.draftStale);
    setLastSnapshot(snapshot.lastSnapshot);
    setOutlines(snapshot.outlines);
    setPostDraft(snapshot.postDraft);
    setSavedDrafts(snapshot.savedDrafts);
    setSeed(snapshot.seed);
    setSelectedId(snapshot.selectedId);
    setStatusMessage(message);
    lastAutoSavedKeyRef.current = createAutoSaveKey(snapshot);
    setAutoSaveState("saved");
    setLastAutoSavedAt(formatAutoSaveTime(new Date()));
  }

  async function refreshConversationRecords(token = accessToken) {
    if (!token) return [];

    const records = (await api.conversations.list(token))
      .map((conversation) => mapConversationRecord(conversation))
      .slice(0, 8);

    setConversationRecords(records);
    setIsHistoryReady(true);
    return records;
  }

  async function refreshConversationRecordsSafely(
    fallbackMessage: string,
    token = accessToken,
  ) {
    try {
      await refreshConversationRecords(token);
    } catch (error) {
      setStatusMessage(getWorkspaceErrorMessage(error, fallbackMessage));
    }
  }

  async function createInitialWorkspace(token: string) {
    const conversation = await api.conversations.create(token, {
      title: "新对话",
      topic: "",
    });

    applyConversation(conversation, {
      message: "写下一句想法后生成大纲。",
    });
    setSeed("");
    setOutlines([]);
    setSelectedId("");
    await refreshConversationRecords(token);
  }

  async function bootstrapWorkspace(token: string) {
    setIsHistoryReady(false);

    const records = await refreshConversationRecords(token);

    if (records[0]) {
      const conversation = await api.conversations.get(token, records[0].conversationId);
      applyConversation(conversation, {
        message: "已从后端恢复最近一次创作。",
        preferSnapshot: true,
      });
      return;
    }

    await createInitialWorkspace(token);
  }

  useEffect(() => {
    let shouldIgnore = false;

    async function restoreSession() {
      try {
        const storedAuth = window.localStorage.getItem(AUTH_STORAGE_KEY);

        if (!storedAuth) {
          setStatusMessage("请登录后开始创作。");
          return;
        }

        const session = JSON.parse(storedAuth) as AuthSession;

        if (!session.accessToken) {
          window.localStorage.removeItem(AUTH_STORAGE_KEY);
          setStatusMessage("请登录后开始创作。");
          return;
        }

        const user = await api.auth.me(session.accessToken);

        if (shouldIgnore) return;

        const nextSession = { accessToken: session.accessToken, user };
        setAccessToken(nextSession.accessToken);
        setAuthUser(nextSession.user);
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
        await bootstrapWorkspace(nextSession.accessToken);
      } catch (error) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        setLoginError(
          getWorkspaceErrorMessage(error, "登录状态已失效，请重新登录。"),
        );
        setStatusMessage("请登录后开始创作。");
      } finally {
        if (!shouldIgnore) setIsAuthReady(true);
      }
    }

    void restoreSession();

    return () => {
      shouldIgnore = true;
    };
    // Restore persisted auth once on mount; later workspace loads are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ensureConversation(token: string) {
    if (conversationId) return conversationId;

    const conversation = await api.conversations.create(token, {
      topic: seed.trim(),
    });

    setConversationId(conversation.id);
    return conversation.id;
  }

  async function startNewConversation() {
    if (!accessToken) {
      setStatusMessage("请先登录，再新增对话。");
      return;
    }

    setIsStartingConversation(true);

    try {
      if (conversationId && autoSaveKey !== lastAutoSavedKeyRef.current) {
        setAutoSaveState("saving");

        const snapshot = workspaceSnapshot;
        const topic = seed.trim();
        const fallbackTitle =
          topic || selectedOutline?.title || postDraft?.title || "新对话";
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

        const savedSnapshot = await api.conversations.createSnapshot(
          accessToken,
          conversationId,
          { snapshot: snapshot as unknown as Record<string, unknown> },
        );
        await api.conversations.update(accessToken, conversationId, updateBody);
        lastAutoSavedKeyRef.current = createAutoSaveKey(snapshot);
        setAutoSaveState("saved");
        setLastAutoSavedAt(formatAutoSaveTime(new Date(savedSnapshot.createdAt)));
      }

      const conversation = await api.conversations.create(accessToken, {
        title: "新对话",
        topic: "",
      });

      setBatch(-1);
      setBriefError("");
      setConversationId(conversation.id);
      setDraftStale(false);
      setLastSnapshot(null);
      setOutlines([]);
      setPostDraft(null);
      setSavedDrafts([]);
      setSeed("");
      setSelectedId("");
      setAutoSaveState("idle");
      setLastAutoSavedAt("");
      lastAutoSavedKeyRef.current = "";
      setStatusMessage("已新建对话，写下主题后生成大纲。");
      await refreshConversationRecordsSafely(
        "已新建对话，但记录列表刷新失败。",
        accessToken,
      );
    } catch (error) {
      setAutoSaveState("error");
      setStatusMessage(
        getWorkspaceErrorMessage(
          error,
          "新建对话失败，当前内容已保留，请稍后重试。",
        ),
      );
    } finally {
      setIsStartingConversation(false);
    }
  }

  async function applyAuthResponse(response: AuthResponse, message: string) {
    const session: AuthSession = {
      accessToken: response.accessToken,
      user: response.user,
    };

    setAccessToken(session.accessToken);
    setAuthUser(session.user);
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    setLoginError("");
    setLoginPassword("");
    setStatusMessage(message);
    await bootstrapWorkspace(session.accessToken);
  }

  function validateSeed() {
    if (seed.trim()) {
      setBriefError("");
      return true;
    }

    setBriefError("先写一句主题，再生成新的大纲。");
    setStatusMessage("主题为空，暂时没有生成新内容。");
    return false;
  }

  async function appendOutlineBatch() {
    if (!validateSeed()) return;
    if (!accessToken) {
      setStatusMessage("请先登录，再生成大纲。");
      return;
    }

    const previousSnapshot = getWorkspaceSnapshot();
    setIsGenerating(true);

    try {
      const currentConversationId = await ensureConversation(accessToken);
      const result = await api.conversations.createOutlineBatch(
        accessToken,
        currentConversationId,
        { prompt: seed },
      );

      setLastSnapshot(previousSnapshot);
      applyConversation(result.conversation, {
        keepLastSnapshot: true,
        message: "已追加新一批大纲，之前生成的仍保留。",
      });
      await refreshConversationRecordsSafely(
        "大纲已生成，但记录列表刷新失败。",
        accessToken,
      );
    } catch (error) {
      setStatusMessage(
        getWorkspaceErrorMessage(error, "大纲生成失败，请稍后重试。"),
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function regenerateOutlines() {
    void appendOutlineBatch();
  }

  function undoBatch() {
    if (!lastSnapshot) return;
    setBatch(lastSnapshot.batch);
    setOutlines(lastSnapshot.outlines);
    setSelectedId(lastSnapshot.selectedId);
    setPostDraft(lastSnapshot.postDraft);
    setDraftStale(false);
    setLastSnapshot(null);
    setStatusMessage("已移除刚追加的大纲，之前生成的内容仍在。");
  }

  function updateOutline(id: string, patch: Partial<Outline>) {
    setOutlines((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
    if (postDraft) setDraftStale(true);
    setStatusMessage("大纲已更新，生成图文可刷新预览。");

    if (!accessToken) return;

    void api.outlines.update(accessToken, id, patch).catch((error) => {
      setStatusMessage(
        getWorkspaceErrorMessage(
          error,
          "大纲已在本地更新，但同步到后端失败。",
        ),
      );
    });
  }

  async function confirmOutline() {
    if (!selectedOutline) return;
    if (!validateSeed()) return;
    if (!accessToken) {
      setStatusMessage("请先登录，再生成图文。");
      return;
    }

    setIsGenerating(true);

    try {
      const currentConversationId = await ensureConversation(accessToken);
      await api.conversations.update(accessToken, currentConversationId, {
        selectedOutlineId: selectedOutline.id,
        topic: seed,
      });
      const draft = await api.conversations.generatePostDraft(
        accessToken,
        currentConversationId,
        { outlineId: selectedOutline.id },
      );

      setPostDraft(mapBackendPostDraft(draft));
      setDraftStale(false);
      setStatusMessage("图文草稿已生成，可以复制或继续微调大纲。");
      await refreshConversationRecordsSafely(
        "图文已生成，但记录列表刷新失败。",
        accessToken,
      );
    } catch (error) {
      setStatusMessage(
        getWorkspaceErrorMessage(error, "图文草稿生成失败，已保留当前大纲。"),
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatusMessage(`${label}已复制。`);
    } catch {
      setStatusMessage("复制失败，请手动选择文本。");
    }
  }

  async function saveDraft() {
    if (isSavingDraft) return;
    if (!postDraft) return;
    if (!accessToken) {
      setStatusMessage("请先登录，再保存草稿。");
      return;
    }

    const draftSignature = getDraftSignature(postDraft);
    const existingDraft = savedDrafts.find(
      (draft) => getDraftSignature(draft) === draftSignature,
    );

    if (existingDraft) {
      setStatusMessage(`这份草稿已在 ${existingDraft.savedAt} 保存过。`);
      return;
    }

    setIsSavingDraft(true);

    try {
      const currentConversationId = await ensureConversation(accessToken);
      await flushPostDraftPatch();
      const savedDraft = await api.conversations.createSavedDraft(
        accessToken,
        currentConversationId,
        { postDraftId: postDraft.id },
      );
      const mappedDraft = mapSavedDraft(savedDraft);

      if (mappedDraft) {
        setSavedDrafts((drafts) =>
          dedupeSavedDrafts([mappedDraft, ...drafts]).slice(0, 3),
        );
      }

      setStatusMessage("已保存草稿，后端会保留这次创作状态。");
      await refreshConversationRecordsSafely(
        "草稿已保存，但记录列表刷新失败。",
        accessToken,
      );
    } catch (error) {
      setStatusMessage(
        getWorkspaceErrorMessage(error, "保存草稿失败，本地编辑已保留。"),
      );
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function generateImage() {
    if (isGeneratingImage) return;
    if (!postDraft) return;
    if (!accessToken) {
      setStatusMessage("请先登录，再生成封面图。");
      return;
    }

    const draftId = postDraft.id;

    setIsGeneratingImage(true);
    setPostDraft((draft) =>
      draft?.id === draftId
        ? { ...draft, imageError: null, imageStatus: "generating" }
        : draft,
    );

    try {
      await flushPostDraftPatch();

      const generatedDraft = await api.postDrafts.generateImage(
        accessToken,
        draftId,
        { imagePrompt: postDraft.imagePrompt },
      );
      const nextPostDraft = mapBackendPostDraft(generatedDraft);

      if (currentPostDraftIdRef.current === draftId) {
        setPostDraft((draft) =>
          draft?.id === draftId
            ? mergePostDraftImageFields(draft, nextPostDraft)
            : draft,
        );
      }

      setStatusMessage("封面图已生成，可以下载或继续调整文案。");
      await refreshConversationRecordsSafely(
        "封面图已生成，但记录列表刷新失败。",
        accessToken,
      );
    } catch (error) {
      const imageError = getWorkspaceErrorMessage(error, "封面图生成失败。");

      setPostDraft((draft) =>
        draft?.id === draftId
          ? {
              ...draft,
              imageError,
              imageGeneratedAt: null,
              imageProvider: null,
              imageStatus: "failed",
              imageUrl: null,
            }
          : draft,
      );
      setStatusMessage(
        getWorkspaceErrorMessage(error, "封面图生成失败，文案已保留。"),
      );
    } finally {
      setIsGeneratingImage(false);
    }
  }

  function downloadImage() {
    const imageUrl = postDraft?.imageUrl;

    if (!imageUrl) {
      setStatusMessage("还没有可下载的封面图。");
      return;
    }

    const title = postDraft?.title.trim() || "rednote-cover";
    const safeBaseName =
      title
        .replace(/[\\/:*?"<>|]+/g, "")
        .replace(/\s+/g, "-")
        .replace(/^\.+/, "")
        .slice(0, 80) || "rednote-cover";
    const extension = imageUrl.startsWith("data:image/svg+xml") ? "svg" : "png";
    const anchor = document.createElement("a");

    anchor.href = imageUrl;
    anchor.download = `${safeBaseName}.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setStatusMessage("封面图已开始下载。");
  }

  function clearPostDraftPatchTimeout() {
    if (!postDraftPatchTimeoutRef.current) return;

    clearTimeout(postDraftPatchTimeoutRef.current);
    postDraftPatchTimeoutRef.current = null;
  }

  async function flushPostDraftPatch(): Promise<void> {
    clearPostDraftPatchTimeout();

    const inFlight = postDraftPatchInFlightRef.current;
    if (inFlight) {
      await inFlight.promise.catch((error: unknown) => {
        const isCurrentDraft = currentPostDraftIdRef.current === inFlight.draftId;

        if (isCurrentDraft) {
          const existingPendingPatch = pendingPostDraftPatchRef.current;
          pendingPostDraftIdRef.current = inFlight.draftId;
          pendingPostDraftPatchRef.current = {
            ...inFlight.patch,
            ...existingPendingPatch,
          };

          if (postDraftPatchSequenceRef.current === inFlight.sequence) {
            setStatusMessage("草稿同步失败，本地编辑已保留。");
          }

          if (postDraftPatchInFlightRef.current === inFlight) {
            postDraftPatchInFlightRef.current = null;
          }

          throw error;
        }
      });

      if (postDraftPatchInFlightRef.current === inFlight) {
        postDraftPatchInFlightRef.current = null;
      }

      return flushPostDraftPatch();
    }

    const draftId = pendingPostDraftIdRef.current;
    const nextPatch = pendingPostDraftPatchRef.current;

    pendingPostDraftIdRef.current = null;
    pendingPostDraftPatchRef.current = null;

    if (!accessToken || !draftId || !nextPatch) return;

    const requestSequence = postDraftPatchSequenceRef.current;
    const request = api.postDrafts
      .update(accessToken, draftId, nextPatch)
      .then(() => undefined);

    const inFlightRequest: PostDraftPatchInFlight = {
      draftId,
      patch: nextPatch,
      promise: request,
      sequence: requestSequence,
    };
    postDraftPatchInFlightRef.current = inFlightRequest;

    try {
      await flushPostDraftPatch();
    } finally {
      if (postDraftPatchInFlightRef.current === inFlightRequest) {
        postDraftPatchInFlightRef.current = null;
      }
    }

    if (
      pendingPostDraftPatchRef.current &&
      pendingPostDraftIdRef.current === currentPostDraftIdRef.current
    ) {
      await flushPostDraftPatch();
    }
  }

  function updatePostDraft(patch: PostDraftPatch) {
    setPostDraft((draft) => (draft ? { ...draft, ...patch } : draft));
    setDraftStale(false);

    if (!accessToken || !postDraft) return;

    postDraftPatchSequenceRef.current += 1;

    if (
      pendingPostDraftIdRef.current &&
      pendingPostDraftIdRef.current !== postDraft.id
    ) {
      pendingPostDraftPatchRef.current = null;
    }

    pendingPostDraftIdRef.current = postDraft.id;
    pendingPostDraftPatchRef.current = {
      ...pendingPostDraftPatchRef.current,
      ...patch,
    };

    clearPostDraftPatchTimeout();

    postDraftPatchTimeoutRef.current = setTimeout(() => {
      void flushPostDraftPatch().catch(() => {});
    }, POST_DRAFT_UPDATE_DEBOUNCE_MS);
  }

  function openSavedDraft(draft: SavedDraft) {
    clearPostDraftPatchTimeout();
    pendingPostDraftIdRef.current = null;
    pendingPostDraftPatchRef.current = null;
    currentPostDraftIdRef.current = draft.id;
    postDraftPatchSequenceRef.current += 1;
    setPostDraft(draft);
    setDraftStale(false);
    setStatusMessage(`已打开 ${draft.savedAt} 保存的草稿。`);
  }

  function getWorkspaceSnapshot(): WorkspaceSnapshot {
    return workspaceSnapshot;
  }

  async function saveConversationRecord() {
    if (!accessToken) {
      setStatusMessage("请先登录，再保存对话记录。");
      return;
    }

    const topic = seed.trim();
    const title = (postDraft?.title ?? selectedOutline?.title ?? topic) || "新对话";

    try {
      const currentConversationId = await ensureConversation(accessToken);
      const snapshot = getWorkspaceSnapshot();
      await api.conversations.update(accessToken, currentConversationId, {
        title,
        topic,
        selectedOutlineId: selectedId,
        statusMessage,
      });
      const savedSnapshot = await api.conversations.createSnapshot(
        accessToken,
        currentConversationId,
        {
          snapshot: snapshot as unknown as Record<string, unknown>,
        },
      );
      lastAutoSavedKeyRef.current = createAutoSaveKey(snapshot);
      setAutoSaveState("saved");
      setLastAutoSavedAt(formatAutoSaveTime(new Date(savedSnapshot.createdAt)));
      setStatusMessage("已保存对话记录，可从记录中恢复完整工作状态。");
      await refreshConversationRecordsSafely(
        "对话记录已保存，但记录列表刷新失败。",
        accessToken,
      );
    } catch (error) {
      setAutoSaveState("error");
      setStatusMessage(
        getWorkspaceErrorMessage(
          error,
          "保存对话记录失败，本地内容已保留。",
        ),
      );
    }
  }

  async function restoreConversationRecord(record: ConversationRecord) {
    if (!accessToken) return;

    if (record.snapshot) {
      setConversationId(record.conversationId);
      applyWorkspaceSnapshot(
        record.snapshot,
        `已恢复 ${record.savedAt} 的对话记录。`,
      );
      return;
    }

    try {
      const conversation = await api.conversations.get(
        accessToken,
        record.conversationId,
      );
      applyConversation(conversation, {
        message: `已恢复 ${record.savedAt} 的对话记录。`,
        preferSnapshot: true,
      });
      await refreshConversationRecordsSafely(
        "已恢复对话记录，但记录列表刷新失败。",
        accessToken,
      );
    } catch (error) {
      setStatusMessage(
        getWorkspaceErrorMessage(error, "恢复对话记录失败，请稍后重试。"),
      );
    }
  }

  async function deleteConversationRecord(record: ConversationRecord) {
    if (!accessToken) return;
    const shouldDelete = window.confirm(
      `删除「${record.title}」后，这条历史记录将无法恢复。`,
    );

    if (!shouldDelete) return;

    try {
      await api.conversations.delete(accessToken, record.conversationId);
      setConversationRecords((records) =>
        records.filter((item) => item.id !== record.id),
      );
      if (record.conversationId === conversationId) {
        setBatch(-1);
        setBriefError("");
        setConversationId(null);
        setDraftStale(false);
        setLastSnapshot(null);
        setOutlines([]);
        setPostDraft(null);
        setSavedDrafts([]);
        setSeed("");
        setSelectedId("");
      }
      setStatusMessage("已删除一条对话记录。");
    } catch (error) {
      setStatusMessage(
        getWorkspaceErrorMessage(error, "删除对话记录失败，请稍后重试。"),
      );
    }
  }

  function switchAuthMode(nextMode: AuthMode) {
    setAuthMode(nextMode);
    setLoginError("");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedAccount = loginAccount.trim().toLowerCase();

    if (!normalizedAccount) {
      setLoginError("请输入账号。");
      return;
    }

    if (loginPassword.length < 6) {
      setLoginError("密码至少 6 位。");
      return;
    }

    setIsAuthSubmitting(true);

    try {
      const response = await api.auth.login({
        account: normalizedAccount,
        password: loginPassword,
      });
      await applyAuthResponse(response, "登录成功，已进入创作工作台。");
    } catch (error) {
      setLoginError(getApiErrorMessage(error));
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedAccount = loginAccount.trim().toLowerCase();
    const displayName = registerName.trim();

    if (!displayName) {
      setLoginError("请输入昵称。");
      return;
    }

    if (!normalizedAccount) {
      setLoginError("请输入账号。");
      return;
    }

    if (loginPassword.length < 6) {
      setLoginError("密码至少 6 位。");
      return;
    }

    setIsAuthSubmitting(true);

    try {
      const response = await api.auth.register({
        account: normalizedAccount,
        name: displayName,
        password: loginPassword,
      });
      await applyAuthResponse(response, "注册成功，已进入创作工作台。");
    } catch (error) {
      setLoginError(getApiErrorMessage(error));
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function loginWithDemoAccount() {
    setLoginAccount("creator@rednote.local");
    setLoginPassword("");
    setLoginError("");
    setAuthMode("login");
    setIsAuthSubmitting(true);

    try {
      const response = await api.auth.demo();
      await applyAuthResponse(response, "已使用演示账号进入工作台。");
    } catch (error) {
      setLoginError(getApiErrorMessage(error));
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  function logout() {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    setAccessToken(null);
    setAuthUser(null);
    setConversationId(null);
    setConversationRecords([]);
    setIsHistoryReady(false);
    setLoginPassword("");
    setLoginError("");
    setOutlines([]);
    setPostDraft(null);
    setSavedDrafts([]);
    setSelectedId("");
    setStatusMessage("已退出登录。");
  }

  if (!isAuthReady) {
    return (
      <main className="login-shell">
        <section className="login-panel login-panel-loading" aria-live="polite">
          <div className="login-brand">
            <span className="brand-stamp">R</span>
            <div>
              <strong>RedNote 内容工坊</strong>
              <small>正在打开工作台</small>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!authUser) {
    return (
      <main className="login-shell">
        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-brand">
            <span className="brand-stamp">R</span>
            <div>
              <strong>RedNote 内容工坊</strong>
              <small>登录后恢复创作记录</small>
            </div>
          </div>

          <form
            className="login-form"
            onSubmit={(event) => {
              void (authMode === "login"
                ? handleLogin(event)
                : handleRegister(event));
            }}
          >
            <div className="login-copy">
              <p className="m-0 font-mono text-xs font-black text-[var(--red)]">
                {authMode === "login" ? "账号登录" : "创建账号"}
              </p>
              <h1 id="login-title">
                {authMode === "login" ? "进入创作台" : "注册创作台"}
              </h1>
            </div>

            <div className="login-mode-switch" aria-label="登录方式">
              <button
                aria-pressed={authMode === "login"}
                onClick={() => switchAuthMode("login")}
                type="button"
              >
                登录
              </button>
              <button
                aria-pressed={authMode === "register"}
                onClick={() => switchAuthMode("register")}
                type="button"
              >
                注册
              </button>
            </div>

            {authMode === "register" ? (
              <label className="login-field">
                <span>昵称</span>
                <input
                  autoComplete="name"
                  onChange={(event) => {
                    setRegisterName(event.target.value);
                    if (loginError) setLoginError("");
                  }}
                  placeholder="内容创作者"
                  value={registerName}
                />
              </label>
            ) : null}

            <label className="login-field">
              <span>账号</span>
              <input
                autoComplete="email"
                inputMode="email"
                onChange={(event) => {
                  setLoginAccount(event.target.value);
                  if (loginError) setLoginError("");
                }}
                placeholder="creator@rednote.local"
                type="email"
                value={loginAccount}
              />
            </label>

            <label className="login-field">
              <span>密码</span>
              <input
                autoComplete="current-password"
                onChange={(event) => {
                  setLoginPassword(event.target.value);
                  if (loginError) setLoginError("");
                }}
                placeholder="至少 6 位"
                type="password"
                value={loginPassword}
              />
            </label>

            {loginError ? <p className="login-error">{loginError}</p> : null}

            <div className="login-actions">
              <button
                className="min-h-[42px] rounded-md border border-transparent bg-[var(--red)] px-3 font-black text-[var(--surface)] transition hover:bg-[var(--red-strong)]"
                disabled={isAuthSubmitting}
                type="submit"
              >
                {isAuthSubmitting
                  ? "处理中"
                  : authMode === "login"
                    ? "登录"
                    : "创建并进入"}
              </button>
              {authMode === "login" ? (
                <button
                  className="min-h-[42px] rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 font-black text-[var(--ink)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)]"
                  disabled={isAuthSubmitting}
                  onClick={() => void loginWithDemoAccount()}
                  type="button"
                >
                  演示账号
                </button>
              ) : null}
            </div>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--canvas)] p-4 text-[var(--ink)]">
      <section className="mx-auto grid max-w-[1480px] gap-4">
        <header className="grid gap-3 rounded-lg border border-[var(--red-soft)] bg-[var(--surface)] p-4 md:grid-cols-[248px_minmax(0,1fr)_auto] md:items-center">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-md bg-[var(--red)] font-mono font-black text-[var(--surface)]">
              R
            </span>
            <div className="min-w-0">
              <strong className="block truncate font-black">
                RedNote 内容工坊
              </strong>
              <small className="font-bold text-[var(--red-strong)]">
                大纲到图文
              </small>
            </div>
          </div>
          <div className="min-w-0">
            <p className="m-0 font-mono text-xs font-black text-[var(--red)]">
              创作台
            </p>
            <h1 className="m-0 text-2xl font-black leading-tight text-[var(--ink)]">
              一句话生成可发布图文笔记
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-2 py-1">
            <span className="grid size-6 place-items-center rounded bg-[var(--red)] text-xs font-black text-[var(--surface)]">
              {authUser.name.slice(0, 1).toUpperCase()}
            </span>
            <strong className="max-w-32 truncate text-sm font-black">
              {authUser.name}
            </strong>
            <button
              className="rounded bg-[var(--surface)] px-2 py-1 text-xs font-black text-[var(--red-strong)]"
              onClick={logout}
              type="button"
            >
              退出
            </button>
          </div>
        </header>

        <div
          className="flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-bold text-[var(--ink-soft)]"
          role="status"
        >
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
          <div className="order-1 grid min-w-0 gap-4 lg:order-2 xl:grid-cols-[minmax(0,1fr)_420px]">
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
                hasPostDraft={Boolean(postDraft)}
                isGenerating={isGenerating}
                isStartingConversation={isStartingConversation}
                latestBatch={latestBatch}
                onConfirmOutline={() => void confirmOutline()}
                onRegenerate={regenerateOutlines}
                onSelectOutline={(outline) => {
                  setSelectedId(outline.id);
                  if (postDraft) setDraftStale(true);
                  setStatusMessage(`已选择「${toneMeta[outline.tone].name}」。`);
                  if (accessToken && conversationId) {
                    void api.conversations
                      .update(accessToken, conversationId, {
                        selectedOutlineId: outline.id,
                      })
                      .catch(() => {});
                  }
                }}
                onUpdateOutline={updateOutline}
                outlineGroups={outlineGroups}
                selectedId={selectedId}
                selectedOutline={selectedOutline}
                workspaceKey={conversationId ?? "local"}
              />
            </div>
            <PostEditor
              draftStale={draftStale}
              isGeneratingImage={isGeneratingImage}
              isSavingDraft={isSavingDraft}
              onCopy={(text, label) => void copyText(text, label)}
              onDownloadImage={downloadImage}
              onDraftChange={updatePostDraft}
              onGenerateImage={generateImage}
              onOpenSavedDraft={openSavedDraft}
              onSaveDraft={() => void saveDraft()}
              postDraft={postDraft}
              savedDrafts={savedDrafts}
              selectedTitle={selectedOutline?.title}
            />
          </div>
          <div className="order-2 lg:order-1">
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
              onRestoreConversation={(record) =>
                void restoreConversationRecord(record)
              }
              onSaveConversation={() => void saveConversationRecord()}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
