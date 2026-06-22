"use client";

import { ArrowRight, Loader2, Mail, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import { loginWithEmailCode, requestEmailCode } from "./auth-api";
import type { AuthUser } from "./auth-types";

type Phase = "email" | "code";
type Message = { tone: "success" | "error"; text: string } | null;

const EMAIL_CODE_COOLDOWN_SECONDS = 60;

export function EmailLoginPanel({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
  const canSubmit = phase === "email" ? email.trim().length > 3 : code.length === 6;

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

      if (phase === "email") {
        await requestEmailCode(normalizedEmail);
        if (!mountedRef.current) return;
        setPhase("code");
        setResendCountdown(EMAIL_CODE_COOLDOWN_SECONDS);
        setMessage({ tone: "success", text: "验证码已发送，请查看邮箱。" });
        return;
      }

      const session = await loginWithEmailCode(normalizedEmail, code);
      if (!mountedRef.current) return;
      setMessage({ tone: "success", text: "登录成功，正在进入工作区。" });
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
                title={email.trim() || "you@example.com"}
                value="邮箱验证码"
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
                  使用邮箱验证码登录或注册，回到你的工作区。
                </p>
              </div>
            </div>

            <label className="mt-5 block text-sm font-[650]">
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
                ) : phase === "email" ? (
                  <Mail aria-hidden="true" size={16} />
                ) : (
                  <ArrowRight aria-hidden="true" size={16} />
                )}
                {phase === "email" ? "发送验证码" : "登录"}
              </button>
              {phase === "code" ? (
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
              <span>验证码会发送到你的邮箱，当前会话由 httpOnly Cookie 保护。</span>
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
