"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  api,
  getApiErrorMessage,
  type AuthResponse,
  type AuthUser,
  type BackendConversation,
  type BackendConversationSummary,
  type BackendOutline,
  type BackendPostDraft,
  type BackendSavedDraft,
} from "@/lib/api";

type OutlineTone = "guide" | "story" | "checklist";

type Outline = {
  id: string;
  batch: number;
  tone: OutlineTone;
  label: string;
  title: string;
  hook: string;
  points: string[];
};

type PostDraft = {
  id: string;
  title: string;
  coverLine: string;
  caption: string;
  imagePrompt: string;
  sections: string[];
  tags: string[];
  stale?: boolean;
};

type Snapshot = {
  batch: number;
  outlines: Outline[];
  postDraft: PostDraft | null;
  selectedId: string;
};

type SavedDraft = PostDraft & {
  savedDraftId: string;
  savedAt: string;
};

type WorkspaceSnapshot = {
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

type ConversationRecord = {
  conversationId: string;
  id: string;
  outlineCount: number;
  savedAt: string;
  snapshot: WorkspaceSnapshot | null;
  title: string;
  topic: string;
};

type AuthMode = "login" | "register";

type AuthSession = {
  accessToken: string;
  user: AuthUser;
};

const AUTH_STORAGE_KEY = "rednote:auth-session";

const DEFAULT_SEED =
  "周末在家低成本做一顿有仪式感的晚餐，适合发小红书";

const toneMeta: Record<OutlineTone, { name: string; mark: string }> = {
  guide: { name: "实用攻略", mark: "攻略" },
  story: { name: "生活叙事", mark: "故事" },
  checklist: { name: "清单拆解", mark: "清单" },
};

function isOutlineTone(tone: string): tone is OutlineTone {
  return tone === "guide" || tone === "story" || tone === "checklist";
}

function formatRecordTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function mapBackendOutline(outline: BackendOutline, batch: number): Outline {
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

function mapBackendPostDraft(draft: BackendPostDraft): PostDraft {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function mapSavedDraft(savedDraft: BackendSavedDraft): SavedDraft | null {
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

function getPostText(postDraft: PostDraft) {
  return [
    postDraft.title,
    postDraft.caption,
    ...postDraft.sections,
    postDraft.tags.map((tag) => `#${tag}`).join(" "),
  ].join("\n");
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
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [batch, setBatch] = useState(-1);
  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [postDraft, setPostDraft] = useState<PostDraft | null>(null);
  const [draftStale, setDraftStale] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [conversationRecords, setConversationRecords] = useState<ConversationRecord[]>([]);
  const [isHistoryReady, setIsHistoryReady] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<Snapshot | null>(null);
  const [statusMessage, setStatusMessage] = useState("正在连接后端工作台。");

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

  const latestBatch = useMemo(
    () => (outlines.length ? Math.max(...outlines.map((outline) => outline.batch)) : -1),
    [outlines],
  );

  const outlineGroups = useMemo(() => {
    return outlines.reduce<Array<{ batch: number; outlines: Outline[] }>>(
      (groups, outline) => {
        const group = groups.find((item) => item.batch === outline.batch);

        if (group) {
          group.outlines.push(outline);
        } else {
          groups.push({ batch: outline.batch, outlines: [outline] });
        }

        return groups;
      },
      [],
    );
  }, [outlines]);

  const selectedOutline = useMemo(
    () => outlines.find((outline) => outline.id === selectedId) ?? outlines[0],
    [outlines, selectedId],
  );

  const currentStep = postDraft ? 3 : selectedOutline ? 2 : 1;

  function mapConversationRecord(
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

  function applyConversation(
    conversation: BackendConversation,
    options: { keepLastSnapshot?: boolean; message?: string } = {},
  ) {
    const nextOutlines = conversation.outlineBatches.flatMap((outlineBatch) =>
      outlineBatch.outlines.map((outline) =>
        mapBackendOutline(outline, outlineBatch.batchNo),
      ),
    );
    const nextPostDraft = conversation.currentPostDraft
      ? mapBackendPostDraft(conversation.currentPostDraft)
      : null;
    const nextSavedDrafts = conversation.savedDrafts
      .map((savedDraft) => mapSavedDraft(savedDraft))
      .filter((savedDraft): savedDraft is SavedDraft => Boolean(savedDraft));

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
      message: "已连接后端，并准备好 3 个方向。",
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
      });
      return;
    }

    await createInitialWorkspace(token);
  }

  async function ensureConversation(token: string) {
    if (conversationId) return conversationId;

    const conversation = await api.conversations.create(token, {
      topic: seed.trim() || DEFAULT_SEED,
    });

    setConversationId(conversation.id);
    return conversation.id;
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
    } catch (error) {
      setStatusMessage(getApiErrorMessage(error));
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
      setStatusMessage(getApiErrorMessage(error));
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
      await refreshConversationRecords(accessToken);
    } catch (error) {
      setStatusMessage(getApiErrorMessage(error));
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
    if (!postDraft) return;
    if (!accessToken) {
      setStatusMessage("请先登录，再保存草稿。");
      return;
    }

    try {
      const currentConversationId = await ensureConversation(accessToken);
      const savedDraft = await api.conversations.createSavedDraft(
        accessToken,
        currentConversationId,
        { postDraftId: postDraft.id },
      );
      const mappedDraft = mapSavedDraft(savedDraft);

      if (mappedDraft) {
        setSavedDrafts((drafts) => [mappedDraft, ...drafts].slice(0, 3));
      }

      setStatusMessage("已保存草稿，后端会保留这次创作状态。");
      await refreshConversationRecords(accessToken);
    } catch (error) {
      setStatusMessage(getApiErrorMessage(error));
    }
  }

  function getWorkspaceSnapshot(): WorkspaceSnapshot {
    return {
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
    };
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
      await api.conversations.update(accessToken, currentConversationId, {
        title,
        topic,
        selectedOutlineId: selectedId,
        statusMessage,
      });
      await api.conversations.createSnapshot(accessToken, currentConversationId, {
        snapshot: getWorkspaceSnapshot() as unknown as Record<string, unknown>,
      });
      await refreshConversationRecords(accessToken);
      setStatusMessage("已保存对话记录，可从记录中恢复完整工作状态。");
    } catch (error) {
      setStatusMessage(getApiErrorMessage(error));
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
      });
      await refreshConversationRecords(accessToken);
    } catch (error) {
      setStatusMessage(getApiErrorMessage(error));
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
    } catch (error) {
      setStatusMessage(getApiErrorMessage(error));
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
          <div className="account-chip" aria-label="当前登录账号">
            <span>{authUser.name.slice(0, 1).toUpperCase()}</span>
            <strong>{authUser.name}</strong>
            <button onClick={logout}>退出</button>
          </div>
        </div>
      </div>

      <section className="workspace-grid">
        <aside className="brief-panel" aria-labelledby="brief-title">
          <div>
            <p className="section-kicker">灵感输入</p>
            <h2 id="brief-title">先写一句话</h2>
          </div>
          <label className="brief-field">
            <span>主题</span>
            <textarea
              value={seed}
              aria-describedby={briefError ? "brief-error" : undefined}
              aria-invalid={Boolean(briefError)}
              onChange={(event) => {
                setSeed(event.target.value);
                if (event.target.value.trim()) setBriefError("");
                if (postDraft) setDraftStale(true);
                setStatusMessage("主题已更新，重新生成大纲后生效。");
              }}
              rows={5}
              placeholder="例如：新手如何把出租屋阳台改成早餐角"
            />
            {briefError ? (
              <small className="brief-error" id="brief-error">
                {briefError}
              </small>
            ) : null}
          </label>
          <div className="brief-actions">
            <button
              className="primary-action"
              disabled={isGenerating}
              onClick={() => void appendOutlineBatch()}
            >
              {isGenerating ? "生成中" : "生成 3 个大纲"}
            </button>
            <button
              className="quiet-action"
              disabled={isGenerating}
              onClick={regenerateOutlines}
            >
              换一批
            </button>
          </div>
          <div className="signal-board" aria-label="生成偏好">
            {["收藏率", "图文节奏", "生活感", "可执行"].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <section className="history-panel" aria-labelledby="history-title">
            <div className="history-heading">
              <div>
                <p className="section-kicker">对话记录</p>
                <strong id="history-title">保留工作状态</strong>
              </div>
              <button
                className="quiet-action compact"
                disabled={!isHistoryReady}
                onClick={() => void saveConversationRecord()}
              >
                保存当前
              </button>
            </div>
            {conversationRecords.length ? (
              <ul className="history-list">
                {conversationRecords.map((record) => (
                  <li key={record.id}>
                    <button
                      className="history-record"
                      aria-label={`恢复记录：${record.title}`}
                      onClick={() => void restoreConversationRecord(record)}
                    >
                      <span>{record.savedAt}</span>
                      <strong>{record.title}</strong>
                      <small>
                        {record.outlineCount} 个大纲 ·{" "}
                        {record.snapshot?.postDraft ? "含图文" : "后端记录"}
                      </small>
                    </button>
                    <button
                      className="history-delete"
                      aria-label={`删除记录：${record.title}`}
                      onClick={() => void deleteConversationRecord(record)}
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="history-empty">暂无记录，保存后可恢复主题、大纲和草稿。</p>
            )}
          </section>
        </aside>

        <section className="outline-panel" aria-labelledby="outline-title">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">方向选择</p>
              <h2 id="outline-title">先比较，再编辑一个</h2>
            </div>
            <button
              className="quiet-action compact"
              disabled={isGenerating}
              onClick={regenerateOutlines}
            >
              {isGenerating ? "生成中" : "换一批"}
            </button>
          </div>

          <div className="outline-batches" aria-label="大纲方向">
            {outlineGroups.map((group) => (
              <section className="outline-batch" key={group.batch}>
                <div className="batch-heading">
                  <span>
                    {group.batch === latestBatch ? "最新一批" : `第 ${group.batch + 1} 批`}
                  </span>
                  <small>{group.outlines.length} 个方向</small>
                </div>
                <div className="outline-options">
                  {group.outlines.map((outline) => {
                    const meta = toneMeta[outline.tone];
                    const isSelected = outline.id === selectedId;

                    return (
                      <button
                        aria-pressed={isSelected}
                        className={`option-card ${isSelected ? "is-selected" : ""}`}
                        key={outline.id}
                        onClick={() => {
                          setSelectedId(outline.id);
                          if (postDraft) setDraftStale(true);
                          setStatusMessage(`已选择「${meta.name}」。`);
                          if (accessToken && conversationId) {
                            void api.conversations
                              .update(accessToken, conversationId, {
                                selectedOutlineId: outline.id,
                              })
                              .catch((error) => {
                                setStatusMessage(getApiErrorMessage(error));
                              });
                          }
                        }}
                      >
                        <span className="option-meta">
                          <strong>{meta.mark}</strong>
                          <em>{outline.label}</em>
                        </span>
                        <span className="option-title">{outline.title}</span>
                        <span className="option-hook">{outline.hook}</span>
                        <span className="mini-points">
                          {outline.points.slice(0, 3).map((point) => (
                            <i key={point}>{point}</i>
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {selectedOutline ? (
            <article className="outline-editor">
              <div className="editor-heading">
                <div>
                  <span>正在编辑</span>
                  <strong>{toneMeta[selectedOutline.tone].name}</strong>
                </div>
                <button
                  className="primary-action compact"
                  disabled={isGenerating}
                  onClick={() => void confirmOutline()}
                >
                  {isGenerating ? "生成中" : postDraft ? "刷新图文" : "生成图文"}
                </button>
              </div>

              <label>
                <span>标题</span>
                <input
                  value={selectedOutline.title}
                  onChange={(event) =>
                    updateOutline(selectedOutline.id, { title: event.target.value })
                  }
                />
              </label>

              <label>
                <span>开场钩子</span>
                <textarea
                  value={selectedOutline.hook}
                  onChange={(event) =>
                    updateOutline(selectedOutline.id, { hook: event.target.value })
                  }
                  rows={2}
                />
              </label>

              <label>
                <span>内容结构</span>
                <textarea
                  value={selectedOutline.points.join("\n")}
                  onChange={(event) =>
                    updateOutline(selectedOutline.id, {
                      points: event.target.value
                        .split("\n")
                        .map((point) => point.trim())
                        .filter(Boolean),
                    })
                  }
                  rows={5}
                />
              </label>
            </article>
          ) : null}
        </section>

        <aside className="post-panel" aria-labelledby="post-title">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">图文预览</p>
              <h2 id="post-title">可复制的草稿包</h2>
            </div>
            {postDraft ? (
              <span className={`draft-badge ${draftStale ? "is-stale" : ""}`}>
                {draftStale ? "待刷新" : "已生成"}
              </span>
            ) : null}
          </div>

          <div className="phone-frame" aria-label="图文笔记预览">
            <div className="cover-art">
              <div className="cover-note">{postDraft?.coverLine ?? "等待生成"}</div>
              <div className="cover-title">
                {postDraft?.title ?? selectedOutline?.title ?? "选择一个大纲"}
              </div>
              <div className="cover-image" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="post-copy">
              {postDraft ? (
                <>
                  <p>{postDraft.caption}</p>
                  <ul>
                    {postDraft.sections.map((section) => (
                      <li key={section}>{section}</li>
                    ))}
                  </ul>
                  <div className="tag-row">
                    {postDraft.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-preview">
                  <span>等待图文</span>
                  <strong>{selectedOutline?.title}</strong>
                  <p>{selectedOutline?.hook}</p>
                </div>
              )}
            </div>
          </div>

          <div className="output-actions" aria-label="图文操作">
            <button
              className="quiet-action compact"
              disabled={!postDraft}
              onClick={() => postDraft && copyText(getPostText(postDraft), "图文草稿")}
            >
              复制草稿
            </button>
            <button
              className="quiet-action compact"
              disabled={!postDraft}
              onClick={() => postDraft && copyText(postDraft.imagePrompt, "封面提示")}
            >
              复制封面提示
            </button>
            <button
              className="quiet-action compact"
              disabled={!postDraft}
              onClick={() => void saveDraft()}
            >
              保存草稿
            </button>
            <button
              className="quiet-action compact"
              disabled={!postDraft || !selectedOutline || isGenerating}
              onClick={() => void confirmOutline()}
            >
              刷新预览
            </button>
          </div>

          <div className="image-brief">
            <span>封面画面</span>
            <p>
              {postDraft?.imagePrompt ??
                "生成后会把封面构图、标题留白和视觉道具整理在这里。"}
            </p>
            {savedDrafts.length ? (
              <div className="saved-drafts" aria-label="已保存草稿">
                {savedDrafts.map((draft) => (
                  <button
                    className="saved-draft"
                    key={`${draft.title}-${draft.savedAt}`}
                    onClick={() => {
                      setPostDraft(draft);
                      setDraftStale(false);
                      setStatusMessage(`已打开 ${draft.savedAt} 保存的草稿。`);
                    }}
                  >
                    <span>{draft.savedAt}</span>
                    {draft.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
