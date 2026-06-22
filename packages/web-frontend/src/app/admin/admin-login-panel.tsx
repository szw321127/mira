"use client";

import { LockKeyhole, LogIn } from "lucide-react";
import { FormEvent, useState } from "react";
import { loginAdmin } from "./admin-api";
import type { AdminSession } from "./admin-types";

const inputClass =
  "mt-2 h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm transition-colors placeholder:text-[var(--muted-strong)] focus:border-[var(--accent)] focus:outline-none focus-visible:outline-none disabled:text-[var(--muted)]";

export function AdminLoginPanel({
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
    if (submitting) return;

    setSubmitting(true);
    onMessage("");

    try {
      onLogin(await loginAdmin(username, password));
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "管理员账号或密码不正确");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-5 py-8 text-[var(--ink)]">
      <form
        className="w-full max-w-[390px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-5"
        onSubmit={submit}
      >
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-[9px] bg-[var(--accent-subtle)] text-[var(--accent-strong)]">
          <LockKeyhole aria-hidden="true" size={21} />
        </div>
        <h1 className="mt-4 text-xl leading-tight font-[720]">管理员登录</h1>
        <p className="mt-1 text-sm text-[var(--muted-strong)]">
          请输入指定账号密码进入 Mira 后台。
        </p>
        <label className="mt-5 block text-sm font-[650]">
          账号
          <input
            autoComplete="username"
            className={inputClass}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="admin"
            value={username}
          />
        </label>
        <label className="mt-3 block text-sm font-[650]">
          密码
          <input
            autoComplete="current-password"
            className={inputClass}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="输入管理员密码"
            type="password"
            value={password}
          />
        </label>
        <button
          className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[9px] bg-[var(--accent)] px-3 text-sm font-[700] text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55"
          disabled={submitting}
          type="submit"
        >
          <LogIn aria-hidden="true" size={16} />
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
