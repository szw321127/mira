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
  DEFAULT_SEED,
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
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [batch, setBatch] = useState(-1);
  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [postDraft, setPostDraft] = useState<PostDraft | null>(null);
  const [draftStale, setDraftStale] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
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

  const currentStep = postDraft ? 3 : selectedOutline ? 2 : 1;

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
    setSeed(conversation.topic || DEFAULT_SEED);
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

  async function createInitialWorkspace(token: string) {
    const conversation = await api.conversations.create(token, {
      topic: DEFAULT_SEED,
    });
    const result = await api.conversations.createOutlineBatch(token, conversation.id, {
      prompt: DEFAULT_SEED,
    });

    applyConversation(result.conversation, {
      message: "已连接后端，并准备好第一批方向。",
    });
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
      } catch {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        setLoginError("登录状态已失效，请重新登录。");
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
      topic: seed.trim() || DEFAULT_SEED,
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
        };

        if (topic) updateBody.topic = topic;

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
        topic: DEFAULT_SEED,
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
      await refreshConversationRecords(accessToken);
    } catch {
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
      await refreshConversationRecords(accessToken);
    } catch {
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

    void api.outlines.update(accessToken, id, patch).catch(() => {});
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
      await refreshConversationRecords(accessToken);
    } catch {
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
      await refreshConversationRecords(accessToken);
    } catch {
    } finally {
      setIsSavingDraft(false);
    }
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

    const topic = seed.trim() || DEFAULT_SEED;
    const title = postDraft?.title ?? selectedOutline?.title ?? topic;

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
      await refreshConversationRecords(accessToken);
      setStatusMessage("已保存对话记录，可从记录中恢复完整工作状态。");
    } catch {
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
      await refreshConversationRecords(accessToken);
    } catch {
    }
  }

  async function deleteConversationRecord(record: ConversationRecord) {
    if (!accessToken) return;

    try {
      await api.conversations.delete(accessToken, record.conversationId);
      setConversationRecords((records) =>
        records.filter((item) => item.id !== record.id),
      );
      if (record.conversationId === conversationId) {
        setConversationId(null);
        setOutlines([]);
        setPostDraft(null);
        setSavedDrafts([]);
        setSelectedId("");
      }
      setStatusMessage("已删除一条对话记录。");
    } catch {
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
              <p className="section-kicker">
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
                className="primary-action"
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
                  className="quiet-action"
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
    <main className="studio-shell">
      <section className="studio-top" aria-labelledby="page-title">
        <div className="brand-lockup" aria-label="RedNote 内容工坊">
          <span className="brand-stamp">R</span>
          <div>
            <strong>RedNote 内容工坊</strong>
            <small>大纲到图文</small>
          </div>
        </div>
        <div className="studio-title-block">
          <p className="section-kicker">创作台</p>
          <h1 id="page-title">一句话生成可编辑图文笔记</h1>
        </div>
        <ol className="step-rail" aria-label="创作流程">
          {["输入灵感", "选大纲", "出图文"].map((step, index) => {
            const stepNumber = index + 1;
            return (
              <li
                className={currentStep === stepNumber ? "is-current" : ""}
                key={step}
              >
                <span>{stepNumber}</span>
                {step}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="status-strip" role="status">
        <span>{statusMessage}</span>
        <div className="status-actions">
          {lastSnapshot ? (
            <button className="text-action" onClick={undoBatch}>
              撤销新增
            </button>
          ) : null}
          <span className={`autosave-pill is-${autoSaveState}`} aria-live="polite">
            {autoSaveLabel}
          </span>
          <div className="account-chip" aria-label="当前登录账号">
            <span>{authUser.name.slice(0, 1).toUpperCase()}</span>
            <strong>{authUser.name}</strong>
            <button onClick={logout}>退出</button>
          </div>
        </div>
      </div>

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
      </section>
    </main>
  );
}
