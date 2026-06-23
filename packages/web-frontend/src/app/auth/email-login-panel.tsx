"use client";

import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  loginWithEmailCode,
  loginWithPassword,
  registerWithPassword,
  requestEmailCode,
} from "./auth-api";
import type { AuthUser } from "./auth-types";

type AuthMode = "email" | "password";
type Phase = "email" | "code";
type PasswordMode = "login" | "register";
type Message = { tone: "success" | "error"; text: string } | null;

const EMAIL_CODE_COOLDOWN_SECONDS = 60;

export function EmailLoginPanel({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [authMode, setAuthMode] = useState<AuthMode>("email");
  const [phase, setPhase] = useState<Phase>("email");
  const [passwordMode, setPasswordMode] = useState<PasswordMode>("login");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
  const canSubmit =
    authMode === "email"
      ? phase === "email"
        ? email.trim().length > 3
        : code.length === 6
      : username.trim().length >= 3 && password.length >= 8;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (resendCountdown <= 0) return;

    const timer = window.setTimeout(() => {
      setResendCountdown((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendCountdown]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || !canSubmit) return;

    submittingRef.current = true;
    setSubmitting(true);
    setMessage(null);

    try {
      const normalizedEmail = email.trim();

      if (authMode === "email" && phase === "email") {
        await requestEmailCode(normalizedEmail);
        if (!mountedRef.current) return;
        setPhase("code");
        setResendCountdown(EMAIL_CODE_COOLDOWN_SECONDS);
        setMessage({ tone: "success", text: "验证码已发送，请查看邮箱。" });
        return;
      }

      const session =
        authMode === "email"
          ? await loginWithEmailCode(normalizedEmail, code)
          : passwordMode === "register"
            ? await registerWithPassword(username.trim(), password)
            : await loginWithPassword(username.trim(), password);
      if (!mountedRef.current) return;
      setMessage({
        tone: "success",
        text:
          authMode === "password" && passwordMode === "register"
            ? "注册成功，正在进入工作区。"
            : "登录成功，正在进入工作区。",
      });
      onLogin(session.user);
    } catch (error) {
      if (!mountedRef.current) return;
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "登录失败",
      });
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }

  async function resendEmailCode() {
    if (submittingRef.current || resendCountdown > 0) return;

    submittingRef.current = true;
    setSubmitting(true);
    setMessage(null);

    try {
      await requestEmailCode(email.trim());
      if (!mountedRef.current) return;
      setCode("");
      setResendCountdown(EMAIL_CODE_COOLDOWN_SECONDS);
      setMessage({ tone: "success", text: "验证码已重新发送，请查看邮箱。" });
    } catch (error) {
      if (!mountedRef.current) return;
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "验证码发送失败",
      });
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }

  return (
    <main className="min-h-dvh bg-[var(--background)] px-4 py-5 text-[var(--ink)] sm:px-6">
      <div className="mx-auto flex min-h-[calc(100dvh-40px)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,420px)_minmax(320px,1fr)] lg:items-center">
          <section className="order-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4 lg:order-1">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
              <div className="min-w-0">
                <div className="text-xs font-[650] tracking-[0.12em] text-[var(--accent-strong)] uppercase">
                  最近工作
                </div>
                <div className="mt-1 truncate text-sm font-[700]">账号工作区</div>
              </div>
              <div className="rounded-[8px] bg-[var(--success-soft)] px-2 py-1 text-xs font-[650] text-[var(--success)]">
                受保护
              </div>
            </div>
            <div className="mt-4">
              <PreviewRow
                label="上次会话"
                title="整理 Mira 增长素材"
                value="12 条上下文"
              />
              <PreviewRow
                label="草稿"
                title="本周内容实验"
                value="等待继续"
              />
              <PreviewRow
                label="账户"
                title={
                  authMode === "password"
                    ? username.trim() || "mira_user"
                    : email.trim() || "you@example.com"
                }
                value={authMode === "password" ? "账号密码" : "邮箱验证码"}
              />
            </div>
          </section>

          <form
            className="order-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-5 lg:order-2"
            onSubmit={submit}
          >
            <Image
              alt="Mira"
              className="h-auto w-[116px]"
              height={40}
              priority
              src="/brand/mira-logo.svg"
              width={116}
            />
            <div className="mt-5 flex items-start gap-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent-subtle)] text-[var(--accent-strong)]">
                <Mail aria-hidden="true" size={19} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl leading-tight font-[720]">继续进入 Mira</h1>
                <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
                  使用邮箱验证码或账号密码，回到你的工作区。
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] p-1">
              <button
                className={`h-9 rounded-[7px] text-sm font-[650] transition-colors ${
                  authMode === "email"
                    ? "bg-[var(--surface)] text-[var(--ink)]"
                    : "text-[var(--muted-strong)] hover:bg-[var(--surface-muted)]"
                }`}
                disabled={submitting}
                onClick={() => {
                  setAuthMode("email");
                  setMessage(null);
                }}
                type="button"
              >
                邮箱验证码
              </button>
              <button
                className={`h-9 rounded-[7px] text-sm font-[650] transition-colors ${
                  authMode === "password"
                    ? "bg-[var(--surface)] text-[var(--ink)]"
                    : "text-[var(--muted-strong)] hover:bg-[var(--surface-muted)]"
                }`}
                disabled={submitting}
                onClick={() => {
                  setAuthMode("password");
                  setMessage(null);
                }}
                type="button"
              >
                账号密码
              </button>
            </div>

            {authMode === "email" ? (
              <>
                <label className="mt-4 block text-sm font-[650]">
                  邮箱
                  <input
                    autoComplete="email"
                    className="mt-2 h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm transition-colors placeholder:text-[var(--muted-strong)] focus:border-[var(--accent)] focus:outline-none focus-visible:outline-none disabled:text-[var(--muted)]"
                    disabled={phase === "code" || submitting}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.com"
                    type="email"
                    value={email}
                  />
                </label>

                {phase === "code" ? (
                  <label className="mt-3 block text-sm font-[650]">
                    验证码
                    <input
                      autoComplete="one-time-code"
                      className="mt-2 h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 font-mono text-sm tracking-[0.16em] transition-colors placeholder:text-[var(--muted-strong)] focus:border-[var(--accent)] focus:outline-none focus-visible:outline-none disabled:text-[var(--muted)]"
                      disabled={submitting}
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) =>
                        setCode(event.target.value.replace(/\D+/g, "").slice(0, 6))
                      }
                      placeholder="000000"
                      value={code}
                    />
                  </label>
                ) : null}
              </>
            ) : (
              <>
                <div className="mt-4 inline-flex overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)]">
                  <button
                    className={`h-9 px-3 text-sm font-[650] transition-colors ${
                      passwordMode === "login"
                        ? "bg-[var(--accent-subtle)] text-[var(--accent-strong)]"
                        : "text-[var(--muted-strong)] hover:bg-[var(--surface-muted)]"
                    }`}
                    disabled={submitting}
                    onClick={() => setPasswordMode("login")}
                    type="button"
                  >
                    登录账号
                  </button>
                  <button
                    className={`h-9 border-l border-[var(--border)] px-3 text-sm font-[650] transition-colors ${
                      passwordMode === "register"
                        ? "bg-[var(--accent-subtle)] text-[var(--accent-strong)]"
                        : "text-[var(--muted-strong)] hover:bg-[var(--surface-muted)]"
                    }`}
                    disabled={submitting}
                    onClick={() => setPasswordMode("register")}
                    type="button"
                  >
                    注册账号
                  </button>
                </div>
                <label className="mt-3 block text-sm font-[650]">
                  {passwordMode === "register" ? "账号名" : "账号名或邮箱"}
                  <input
                    autoComplete="username"
                    className="mt-2 h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm transition-colors placeholder:text-[var(--muted-strong)] focus:border-[var(--accent)] focus:outline-none focus-visible:outline-none disabled:text-[var(--muted)]"
                    disabled={submitting}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder={
                      passwordMode === "register" ? "mira_user" : "mira_user 或 name@example.com"
                    }
                    value={username}
                  />
                </label>
                <label className="mt-3 block text-sm font-[650]">
                  密码
                  <span className="mt-2 grid h-10 grid-cols-[minmax(0,1fr)_40px] rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] transition-colors focus-within:border-[var(--accent)]">
                    <input
                      autoComplete={passwordMode === "register" ? "new-password" : "current-password"}
                      className="min-w-0 border-0 bg-transparent px-3 text-sm outline-0 placeholder:text-[var(--muted-strong)] disabled:text-[var(--muted)]"
                      disabled={submitting}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="至少 8 位"
                      type={showPassword ? "text" : "password"}
                      value={password}
                    />
                    <button
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                      className="inline-flex h-full items-center justify-center text-[var(--muted)] hover:text-[var(--ink)]"
                      onClick={() => setShowPassword((value) => !value)}
                      type="button"
                    >
                      {showPassword ? (
                        <EyeOff aria-hidden="true" size={16} />
                      ) : (
                        <Eye aria-hidden="true" size={16} />
                      )}
                    </button>
                  </span>
                </label>
              </>
            )}

            {message ? (
              <div
                className={`mt-3 rounded-[8px] px-3 py-2 text-sm ${
                  message.tone === "success"
                    ? "bg-[var(--success-soft)] text-[var(--success)]"
                    : "bg-[var(--danger-soft)] text-[var(--danger)]"
                }`}
                role="status"
              >
                {message.text}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-[var(--accent)] px-3 text-sm font-[700] text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55 sm:flex-1"
                disabled={!canSubmit || submitting}
                type="submit"
              >
                {submitting ? (
                  <Loader2 aria-hidden="true" className="animate-spin" size={16} />
                ) : authMode === "password" ? (
                  <LockKeyhole aria-hidden="true" size={16} />
                ) : phase === "email" ? (
                  <Mail aria-hidden="true" size={16} />
                ) : (
                  <ArrowRight aria-hidden="true" size={16} />
                )}
                {authMode === "password"
                  ? passwordMode === "register"
                    ? "注册账号"
                    : "登录账号"
                  : phase === "email"
                    ? "发送验证码"
                    : "登录"}
              </button>
              {authMode === "email" && phase === "code" ? (
                <>
                  <button
                    className="inline-flex h-10 min-w-[108px] items-center justify-center rounded-[9px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm font-[650] tabular-nums hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55"
                    disabled={submitting || resendCountdown > 0}
                    onClick={resendEmailCode}
                    type="button"
                  >
                    {resendCountdown > 0
                      ? `${resendCountdown}s 后重发`
                      : submitting
                        ? "发送中"
                        : "重新发送"}
                  </button>
                  <button
                    className="inline-flex h-10 items-center justify-center rounded-[9px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm font-[650] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55"
                    disabled={submitting}
                    onClick={() => {
                      setPhase("email");
                      setCode("");
                      setMessage(null);
                      setResendCountdown(0);
                    }}
                    type="button"
                  >
                    更换邮箱
                  </button>
                </>
              ) : null}
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs leading-5 text-[var(--muted)]">
              <ShieldCheck aria-hidden="true" className="shrink-0" size={15} />
              <span>
                {authMode === "email"
                  ? "验证码会发送到你的邮箱，当前会话由 httpOnly Cookie 保护。"
                  : "密码只会发送到 Mira 后端验证，当前会话由 httpOnly Cookie 保护。"}
              </span>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

function PreviewRow({
  label,
  title,
  value,
}: {
  label: string;
  title: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-[var(--border)] py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-xs text-[var(--muted)]">{label}</div>
        <div className="mt-1 truncate text-sm font-[650]">{title}</div>
      </div>
      <div className="self-end whitespace-nowrap text-xs text-[var(--muted-strong)]">
        {value}
      </div>
    </div>
  );
}
