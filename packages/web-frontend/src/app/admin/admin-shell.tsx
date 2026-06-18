"use client";

import {
  KeyRound,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { AdminSession, ManagedSecret } from "./admin-types";

type LoadState = "checking" | "guest" | "ready";

async function readJson<T>(response: Response): Promise<T> {
  const value: unknown = await response.json().catch(() => ({}));
  return value as T;
}

export function AdminShell() {
  const [loadState, setLoadState] = useState<LoadState>("checking");
  const [session, setSession] = useState<AdminSession | null>(null);
  const [secrets, setSecrets] = useState<ManagedSecret[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    loadInitialAdminState()
      .then((initialState) => {
        if (!active) return;
        setSession(initialState.session);
        setSecrets(initialState.secrets);
        setLoadState(initialState.session ? "ready" : "guest");
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setSecrets([]);
        setLoadState("guest");
      });

    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setSession(null);
    setSecrets([]);
    setLoadState("guest");
  }

  if (loadState === "checking") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-6 text-[var(--ink)]">
        <div className="text-sm text-[var(--muted)]">正在验证管理员会话</div>
      </main>
    );
  }

  if (!session) {
    return (
      <LoginPanel
        message={message}
        onLogin={(nextSession) => {
          setSession(nextSession);
          setLoadState("ready");
          setMessage("");
          void loadSecrets(setSecrets);
        }}
        onMessage={setMessage}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-[var(--background)] text-[var(--ink)]">
      <header className="border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--background)_82%,var(--surface))]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-[650] tracking-[0.12em] text-[var(--accent-strong)] uppercase">
              <ShieldCheck aria-hidden="true" size={15} />
              Mira Admin
            </div>
            <h1 className="mt-2 text-xl leading-tight font-[720]">
              Key 管理与账号信息
            </h1>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-[650] hover:bg-[var(--surface-muted)]"
            onClick={logout}
            type="button"
          >
            <LogOut aria-hidden="true" size={16} />
            退出
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-5 py-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 text-sm font-[700]">
            <UserRound aria-hidden="true" size={17} />
            账号信息
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--muted)]">当前管理员</dt>
              <dd className="mt-1 font-[650]">{session.username}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">会话</dt>
              <dd className="mt-1 text-[var(--success)]">已通过 httpOnly Cookie 保护</dd>
            </div>
          </dl>
          <PasswordPanel onMessage={setMessage} />
        </section>

        <section className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-[700]">
                <KeyRound aria-hidden="true" size={17} />
                Key 管理
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                管理模型、搜索等后端服务配置。敏感值保存后只展示掩码。
              </p>
            </div>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm hover:bg-[var(--surface-muted)]"
              onClick={() => void loadSecrets(setSecrets)}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={15} />
              刷新
            </button>
          </div>
          <SecretsPanel
            onMessage={setMessage}
            onSecrets={setSecrets}
            secrets={secrets}
          />
        </section>
      </div>

      {message ? (
        <div className="fixed right-4 bottom-4 max-w-[min(360px,calc(100vw-32px))] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm shadow-[0_18px_48px_oklch(0.18_0.01_260/0.16)]">
          {message}
        </div>
      ) : null}
    </main>
  );
}

async function loadInitialAdminState() {
  const sessionResponse = await fetch("/api/admin/session");
  if (!sessionResponse.ok) {
    return { session: null, secrets: [] };
  }

  const session = await readJson<AdminSession>(sessionResponse);
  const secretsResponse = await fetch("/api/admin/secrets");
  if (!secretsResponse.ok) {
    return { session, secrets: [] };
  }

  const data = await readJson<{ secrets: ManagedSecret[] }>(secretsResponse);
  return { session, secrets: data.secrets };
}

async function loadSecrets(onSecrets: (secrets: ManagedSecret[]) => void) {
  const response = await fetch("/api/admin/secrets");
  if (!response.ok) return;
  const data = await readJson<{ secrets: ManagedSecret[] }>(response);
  onSecrets(data.secrets);
}

function LoginPanel({
  message,
  onLogin,
  onMessage,
}: {
  message: string;
  onLogin: (session: AdminSession) => void;
  onMessage: (message: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setSubmitting(false);

    if (!response.ok) {
      onMessage("管理员账号或密码不正确");
      return;
    }

    onLogin(await readJson<AdminSession>(response));
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-5 py-8 text-[var(--ink)]">
      <form
        className="w-full max-w-[390px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_18px_48px_oklch(0.18_0.01_260/0.08)]"
        onSubmit={submit}
      >
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-[9px] bg-[var(--accent-subtle)] text-[var(--accent-strong)]">
          <LockKeyhole aria-hidden="true" size={21} />
        </div>
        <h1 className="mt-4 text-xl font-[720]">管理员登录</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          请输入指定账号密码进入 Mira 后台。
        </p>
        <label className="mt-5 block text-sm font-[650]">
          账号
          <input
            className="mt-2 h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm"
            onChange={(event) => setUsername(event.target.value)}
            value={username}
          />
        </label>
        <label className="mt-3 block text-sm font-[650]">
          密码
          <input
            className="mt-2 h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>
        <button
          className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-[9px] bg-[var(--accent)] px-3 text-sm font-[700] text-white hover:bg-[var(--accent-strong)] disabled:opacity-55"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "登录中" : "登录"}
        </button>
        {message ? (
          <div className="mt-3 rounded-[8px] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
            {message}
          </div>
        ) : null}
      </form>
    </main>
  );
}

function PasswordPanel({ onMessage }: { onMessage: (message: string) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/admin/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    onMessage(response.ok ? "密码已更新" : "密码修改失败，请检查当前密码");
    if (response.ok) {
      setCurrentPassword("");
      setNewPassword("");
    }
  }

  return (
    <form className="mt-6 border-t border-[var(--border)] pt-4" onSubmit={submit}>
      <div className="text-sm font-[700]">修改密码</div>
      <input
        className="mt-3 h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm"
        onChange={(event) => setCurrentPassword(event.target.value)}
        placeholder="当前密码"
        type="password"
        value={currentPassword}
      />
      <input
        className="mt-2 h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm"
        onChange={(event) => setNewPassword(event.target.value)}
        placeholder="新密码，至少 8 位"
        type="password"
        value={newPassword}
      />
      <button
        className="mt-3 inline-flex h-9 items-center gap-2 rounded-[9px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm font-[650] hover:bg-[var(--surface-muted)]"
        type="submit"
      >
        <Save aria-hidden="true" size={15} />
        保存密码
      </button>
    </form>
  );
}

function SecretsPanel({
  secrets,
  onMessage,
  onSecrets,
}: {
  secrets: ManagedSecret[];
  onMessage: (message: string) => void;
  onSecrets: (secrets: ManagedSecret[]) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const secretsPayload = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value.trim().length > 0),
    );
    const response = await fetch("/api/admin/secrets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secrets: secretsPayload }),
    });

    if (!response.ok) {
      onMessage("Key 保存失败");
      return;
    }

    const data = await readJson<{ secrets: ManagedSecret[] }>(response);
    onMessage("Key 配置已保存");
    onSecrets(data.secrets);
    setValues({});
  }

  return (
    <form className="mt-4" onSubmit={submit}>
      <div className="overflow-hidden rounded-[8px] border border-[var(--border)]">
        {secrets.map((secret) => (
          <div
            className="grid gap-3 border-b border-[var(--border)] bg-[var(--surface-raised)] p-3 last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)]"
            key={secret.key}
          >
            <div>
              <div className="text-sm font-[650]">{secret.label}</div>
              <div className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                {secret.key}
              </div>
            </div>
            <div className="min-w-0">
              <div className="mb-2 truncate font-mono text-xs text-[var(--muted-strong)]">
                当前：{secret.value || "未配置"}
              </div>
              <input
                className="h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [secret.key]: event.target.value,
                  }))
                }
                placeholder={secret.masked ? "输入新值后覆盖" : "输入新值"}
                type={secret.masked ? "password" : "text"}
                value={values[secret.key] ?? ""}
              />
            </div>
          </div>
        ))}
      </div>
      <button
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-[9px] bg-[var(--accent)] px-4 text-sm font-[700] text-white hover:bg-[var(--accent-strong)]"
        type="submit"
      >
        <Save aria-hidden="true" size={16} />
        保存 Key 配置
      </button>
    </form>
  );
}
