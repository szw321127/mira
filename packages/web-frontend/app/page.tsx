"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

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
  title: string;
  coverLine: string;
  caption: string;
  imagePrompt: string;
  sections: string[];
  tags: string[];
};

type Snapshot = {
  batch: number;
  outlines: Outline[];
  postDraft: PostDraft | null;
  selectedId: string;
};

type SavedDraft = PostDraft & {
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
  id: string;
  outlineCount: number;
  savedAt: string;
  snapshot: WorkspaceSnapshot;
  title: string;
  topic: string;
};

type AuthUser = {
  account: string;
  id: string;
  loginAt: string;
  name: string;
};

type AuthMode = "login" | "register";

type RegisteredAccount = {
  account: string;
  createdAt: string;
  name: string;
};

const AUTH_STORAGE_KEY = "rednote:auth-user";
const CONVERSATION_STORAGE_KEY = "rednote:conversation-records";
const REGISTERED_ACCOUNTS_STORAGE_KEY = "rednote:registered-accounts";

const DEFAULT_SEED =
  "周末在家低成本做一顿有仪式感的晚餐，适合发小红书";

const toneMeta: Record<OutlineTone, { name: string; mark: string }> = {
  guide: { name: "实用攻略", mark: "攻略" },
  story: { name: "生活叙事", mark: "故事" },
  checklist: { name: "清单拆解", mark: "清单" },
};

const outlineBanks = [
  [
    {
      tone: "guide",
      label: "高保存率",
      title: "把一句灵感拆成可执行的 5 步",
      hook: "先给读者一个立刻想收藏的理由。",
      points: ["痛点场景", "准备清单", "操作步骤", "避坑提醒", "结尾互动"],
    },
    {
      tone: "story",
      label: "强代入感",
      title: "用一天里的转折写出生活感",
      hook: "从一个小尴尬或小惊喜开始。",
      points: ["开场画面", "情绪铺垫", "关键选择", "结果反差", "温柔收束"],
    },
    {
      tone: "checklist",
      label: "快读结构",
      title: "三类人群都能用的发布框架",
      hook: "把内容变成一张清楚的选择表。",
      points: ["适合谁", "不适合谁", "核心步骤", "替代方案", "保存提示"],
    },
  ],
  [
    {
      tone: "story",
      label: "更有人味",
      title: "从真实困扰写到一个漂亮解法",
      hook: "先承认这件事没那么完美。",
      points: ["真实开头", "现场细节", "尝试过程", "关键发现", "给读者的建议"],
    },
    {
      tone: "guide",
      label: "更像教程",
      title: "用前后对比做一篇干货图文",
      hook: "第一屏直接展示变化。",
      points: ["原始状态", "目标效果", "工具材料", "分步说明", "最终复盘"],
    },
    {
      tone: "checklist",
      label: "更易转发",
      title: "把经验整理成可截图的备忘录",
      hook: "每一条都短到可以被记住。",
      points: ["必做三件事", "可选加分项", "预算控制", "时间安排", "失败补救"],
    },
  ],
  [
    {
      tone: "checklist",
      label: "更利落",
      title: "一页讲完准备、执行、复盘",
      hook: "用一句话定义这篇内容的收益。",
      points: ["准备前", "进行中", "完成后", "常见问题", "评论引导"],
    },
    {
      tone: "guide",
      label: "更有节奏",
      title: "把普通主题做成连续翻页体验",
      hook: "每一页只解决一个问题。",
      points: ["封面钩子", "问题拆解", "方法展开", "例子证明", "行动清单"],
    },
    {
      tone: "story",
      label: "更有温度",
      title: "用一个具体瞬间承载整篇笔记",
      hook: "让读者先看见人，再看见方法。",
      points: ["人物状态", "环境气味", "动作细节", "情绪变化", "余味结尾"],
    },
  ],
] satisfies Array<
  Array<Omit<Outline, "batch" | "id">>
>;

function createOutlines(seed: string, batch: number): Outline[] {
  const source = outlineBanks[batch % outlineBanks.length];
  const topic = seed.trim() || DEFAULT_SEED;

  return source.map((outline, index) => ({
    ...outline,
    id: `${batch}-${index}`,
    batch,
    title: `${outline.title}：${topic.slice(0, 18)}`,
  }));
}

function createPostDraft(seed: string, outline: Outline): PostDraft {
  const topic = seed.trim() || DEFAULT_SEED;
  const firstPoint = outline.points[0] ?? "核心场景";
  const secondPoint = outline.points[1] ?? "执行步骤";

  return {
    title: outline.title.replace("：", " | "),
    coverLine: `${toneMeta[outline.tone].name} / ${outline.label}`,
    caption: `今天这篇围绕「${topic}」展开，用「${firstPoint}」先把读者带进来，再用「${secondPoint}」给出清楚路径。整体语气保持自然、具体、可收藏。`,
    imagePrompt: `竖版图文封面，主题为「${topic}」，画面有手写批注、红色贴纸、生活道具、自然窗光，标题区域留白清楚。`,
    sections: outline.points.map((point, index) => {
      const verbs = ["定调", "展开", "证明", "补充", "收束"];
      return `${index + 1}. ${point}：用${verbs[index] ?? "说明"}的方式写 2 到 3 句，避免空泛形容。`;
    }),
    tags: ["小红书图文", toneMeta[outline.tone].name, outline.label, "可编辑大纲"],
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
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loginAccount, setLoginAccount] = useState("creator@rednote.local");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registeredAccounts, setRegisteredAccounts] = useState<RegisteredAccount[]>([]);
  const [isRegisteredReady, setIsRegisteredReady] = useState(false);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [batch, setBatch] = useState(0);
  const [outlines, setOutlines] = useState(() => createOutlines(DEFAULT_SEED, 0));
  const [selectedId, setSelectedId] = useState(outlines[0]?.id ?? "");
  const [postDraft, setPostDraft] = useState<PostDraft | null>(null);
  const [draftStale, setDraftStale] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [conversationRecords, setConversationRecords] = useState<ConversationRecord[]>([]);
  const [isHistoryReady, setIsHistoryReady] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<Snapshot | null>(null);
  const [statusMessage, setStatusMessage] = useState("已准备 3 个方向，可先比较再编辑。");

  useEffect(() => {
    let storedUser: AuthUser | null = null;
    let hasReadError = false;

    try {
      const storedAuth = window.localStorage.getItem(AUTH_STORAGE_KEY);

      if (storedAuth) {
        storedUser = JSON.parse(storedAuth) as AuthUser;
      }
    } catch {
      hasReadError = true;
    }

    const authTimer = window.setTimeout(() => {
      setAuthUser(storedUser);
      if (hasReadError) {
        setLoginError("登录状态读取失败，请重新登录。");
      }
      setIsAuthReady(true);
    }, 0);

    return () => window.clearTimeout(authTimer);
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    try {
      if (authUser) {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));
      } else {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch {
      window.setTimeout(() => {
        setStatusMessage("登录状态保存失败，当前工作不受影响。");
      }, 0);
    }
  }, [authUser, isAuthReady]);

  useEffect(() => {
    let storedAccounts: RegisteredAccount[] = [];

    try {
      const stored = window.localStorage.getItem(REGISTERED_ACCOUNTS_STORAGE_KEY);

      if (stored) {
        storedAccounts = JSON.parse(stored) as RegisteredAccount[];
      }
    } catch {
      storedAccounts = [];
    }

    const registerTimer = window.setTimeout(() => {
      setRegisteredAccounts(storedAccounts);
      setIsRegisteredReady(true);
    }, 0);

    return () => window.clearTimeout(registerTimer);
  }, []);

  useEffect(() => {
    if (!isRegisteredReady) return;

    try {
      window.localStorage.setItem(
        REGISTERED_ACCOUNTS_STORAGE_KEY,
        JSON.stringify(registeredAccounts),
      );
    } catch {
      window.setTimeout(() => {
        setLoginError("注册信息保存失败，请稍后重试。");
      }, 0);
    }
  }, [isRegisteredReady, registeredAccounts]);

  useEffect(() => {
    let storedHistory: ConversationRecord[] = [];
    let hasReadError = false;

    try {
      const storedRecords = window.localStorage.getItem(CONVERSATION_STORAGE_KEY);

      if (storedRecords) {
        storedHistory = JSON.parse(storedRecords) as ConversationRecord[];
      }
    } catch {
      hasReadError = true;
    }

    const loadTimer = window.setTimeout(() => {
      setConversationRecords(storedHistory);
      if (hasReadError) {
        setStatusMessage("对话记录读取失败，当前工作不受影响。");
      }
      setIsHistoryReady(true);
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  useEffect(() => {
    if (!isHistoryReady) return;

    try {
      window.localStorage.setItem(
        CONVERSATION_STORAGE_KEY,
        JSON.stringify(conversationRecords),
      );
    } catch {
      window.setTimeout(() => {
        setStatusMessage("对话记录保存失败，请减少记录数量后重试。");
      }, 0);
    }
  }, [conversationRecords, isHistoryReady]);

  const latestBatch = useMemo(
    () => Math.max(...outlines.map((outline) => outline.batch)),
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

  function rememberCurrentState() {
    setLastSnapshot({ batch, outlines, postDraft, selectedId });
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

  function appendOutlineBatch() {
    if (!validateSeed()) return;

    rememberCurrentState();
    setIsGenerating(true);
    const nextBatch = batch + 1;
    const nextOutlines = createOutlines(seed, nextBatch);
    setBatch(nextBatch);
    setOutlines((items) => [...nextOutlines, ...items]);
    setSelectedId(nextOutlines[0]?.id ?? "");
    setDraftStale(Boolean(postDraft));
    setStatusMessage("已追加新一批大纲，之前生成的仍保留。");
    window.setTimeout(() => setIsGenerating(false), 180);
  }

  function regenerateOutlines() {
    appendOutlineBatch();
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
  }

  function confirmOutline() {
    if (!selectedOutline) return;
    if (!validateSeed()) return;

    setIsGenerating(true);
    setPostDraft(createPostDraft(seed, selectedOutline));
    setDraftStale(false);
    setStatusMessage("图文草稿已生成，可以复制或继续微调大纲。");
    window.setTimeout(() => setIsGenerating(false), 180);
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatusMessage(`${label}已复制。`);
    } catch {
      setStatusMessage("复制失败，请手动选择文本。");
    }
  }

  function saveDraft() {
    if (!postDraft) return;

    const savedAt = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());

    setSavedDrafts((drafts) => [{ ...postDraft, savedAt }, ...drafts].slice(0, 3));
    setStatusMessage(`已保存草稿，当前保留 ${Math.min(savedDrafts.length + 1, 3)} 条。`);
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

  function saveConversationRecord() {
    const topic = seed.trim() || DEFAULT_SEED;
    const savedAt = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const title = postDraft?.title ?? selectedOutline?.title ?? topic;
    const record: ConversationRecord = {
      id: `${Date.now()}`,
      outlineCount: outlines.length,
      savedAt,
      snapshot: getWorkspaceSnapshot(),
      title,
      topic,
    };

    setConversationRecords((records) => [record, ...records].slice(0, 8));
    setStatusMessage("已保存对话记录，可从记录中恢复完整工作状态。");
  }

  function restoreConversationRecord(record: ConversationRecord) {
    const { snapshot } = record;

    setBatch(snapshot.batch);
    setBriefError(snapshot.briefError);
    setDraftStale(snapshot.draftStale);
    setLastSnapshot(snapshot.lastSnapshot);
    setOutlines(snapshot.outlines);
    setPostDraft(snapshot.postDraft);
    setSavedDrafts(snapshot.savedDrafts);
    setSeed(snapshot.seed);
    setSelectedId(snapshot.selectedId);
    setStatusMessage(`已恢复 ${record.savedAt} 的对话记录。`);
  }

  function deleteConversationRecord(id: string) {
    setConversationRecords((records) => records.filter((record) => record.id !== id));
    setStatusMessage("已删除一条对话记录。");
  }

  function createAuthUser(account: string, displayName?: string): AuthUser {
    const normalizedAccount = account.trim().toLowerCase();
    const name = displayName?.trim() || normalizedAccount.split("@")[0] || "内容创作者";

    return {
      account: normalizedAccount,
      id: normalizedAccount,
      loginAt: new Date().toISOString(),
      name,
    };
  }

  function switchAuthMode(nextMode: AuthMode) {
    setAuthMode(nextMode);
    setLoginError("");
  }

  function handleLogin(event: FormEvent<HTMLFormElement>) {
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

    const registeredAccount = registeredAccounts.find(
      (account) => account.account === normalizedAccount,
    );
    const isDemoAccount = normalizedAccount === "creator@rednote.local";

    if (!registeredAccount && !isDemoAccount) {
      setLoginError("账号未注册。");
      return;
    }

    setAuthUser(createAuthUser(normalizedAccount, registeredAccount?.name));
    setLoginError("");
    setLoginPassword("");
    setStatusMessage("登录成功，已进入创作工作台。");
  }

  function handleRegister(event: FormEvent<HTMLFormElement>) {
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

    if (registeredAccounts.some((account) => account.account === normalizedAccount)) {
      setLoginError("账号已注册，请直接登录。");
      return;
    }

    const registeredAccount: RegisteredAccount = {
      account: normalizedAccount,
      createdAt: new Date().toISOString(),
      name: displayName,
    };

    setRegisteredAccounts((accounts) => [registeredAccount, ...accounts]);
    setAuthUser(createAuthUser(normalizedAccount, displayName));
    setLoginError("");
    setLoginPassword("");
    setStatusMessage("注册成功，已进入创作工作台。");
  }

  function loginWithDemoAccount() {
    setLoginAccount("creator@rednote.local");
    setLoginPassword("");
    setLoginError("");
    setAuthMode("login");
    setAuthUser(createAuthUser("creator@rednote.local"));
    setStatusMessage("已使用演示账号进入工作台。");
  }

  function logout() {
    setAuthUser(null);
    setLoginPassword("");
    setLoginError("");
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
            onSubmit={authMode === "login" ? handleLogin : handleRegister}
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
              <button className="primary-action" type="submit">
                {authMode === "login" ? "登录" : "创建并进入"}
              </button>
              {authMode === "login" ? (
                <button
                  className="quiet-action"
                  onClick={loginWithDemoAccount}
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
              onClick={appendOutlineBatch}
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
                onClick={saveConversationRecord}
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
                      onClick={() => restoreConversationRecord(record)}
                    >
                      <span>{record.savedAt}</span>
                      <strong>{record.title}</strong>
                      <small>
                        {record.outlineCount} 个大纲 · {record.snapshot.postDraft ? "含图文" : "未生成图文"}
                      </small>
                    </button>
                    <button
                      className="history-delete"
                      aria-label={`删除记录：${record.title}`}
                      onClick={() => deleteConversationRecord(record.id)}
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
                  onClick={confirmOutline}
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
              onClick={saveDraft}
            >
              保存草稿
            </button>
            <button
              className="quiet-action compact"
              disabled={!postDraft || !selectedOutline || isGenerating}
              onClick={confirmOutline}
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
