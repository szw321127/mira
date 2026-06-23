"use client";

import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { bindEmailToAccount, requestBindEmailCode } from "./auth-api";
import type { AuthUser } from "./auth-types";

type BindPhase = "email" | "code";
type Message = { tone: "success" | "error"; text: string } | null;

const EMAIL_BIND_COOLDOWN_SECONDS = 60;

export function EmailBindPanel({
  onUserChange,
}: {
  onUserChange: (user: AuthUser) => void;
}) {
  const [phase, setPhase] = useState<BindPhase>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [resendCountdown, setResendCountdown] = useState(0);
  const mountedRef = useRef(true);
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
    if (submitting || !canSubmit) return;

    setSubmitting(true);
    setMessage(null);
    try {
      if (phase === "email") {
        await requestBindEmailCode(email.trim());
        if (!mountedRef.current) return;
        setPhase("code");
        setResendCountdown(EMAIL_BIND_COOLDOWN_SECONDS);
        setMessage({ tone: "success", text: "验证码已发送，请查看邮箱。" });
        return;
      }

      const session = await bindEmailToAccount(email.trim(), code);
      if (!mountedRef.current) return;
      setMessage({ tone: "success", text: "邮箱已绑定。" });
      onUserChange(session.user);
    } catch (error) {
      if (!mountedRef.current) return;
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "邮箱绑定失败",
      });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }

  return (
    <form
      className="border-b border-[var(--border)] bg-[var(--accent-subtle)] px-4 py-2.5 text-[13px] text-[var(--ink)]"
      onSubmit={submit}
    >
      <div className="mx-auto flex max-w-[980px] flex-col gap-2 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Mail
            aria-hidden="true"
            className="shrink-0 text-[var(--accent-strong)]"
            size={16}
          />
          <span className="font-[650]">绑定邮箱</span>
          <span className="min-w-0 text-[var(--muted-strong)]">
            绑定后可继续使用邮箱验证码登录，也能找回账号。
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            autoComplete="email"
            className="h-9 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm placeholder:text-[var(--muted-strong)] focus:border-[var(--accent)] focus:outline-none focus-visible:outline-none disabled:text-[var(--muted)] sm:w-[220px]"
            disabled={phase === "code" || submitting}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            type="email"
            value={email}
          />
          {phase === "code" ? (
            <input
              autoComplete="one-time-code"
              className="h-9 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 font-mono text-sm tracking-[0.16em] placeholder:text-[var(--muted-strong)] focus:border-[var(--accent)] focus:outline-none focus-visible:outline-none disabled:text-[var(--muted)] sm:w-[118px]"
              disabled={submitting}
              inputMode="numeric"
              maxLength={6}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D+/g, "").slice(0, 6))
              }
              placeholder="000000"
              value={code}
            />
          ) : null}
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] px-3 text-sm font-[700] text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={!canSubmit || submitting}
            type="submit"
          >
            {submitting ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={15} />
            ) : phase === "code" ? (
              <CheckCircle2 aria-hidden="true" size={15} />
            ) : (
              <Mail aria-hidden="true" size={15} />
            )}
            {phase === "code" ? "确认绑定" : "发送验证码"}
          </button>
          {phase === "code" ? (
            <button
              className="h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-[650] tabular-nums hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55"
              disabled={submitting || resendCountdown > 0}
              onClick={async () => {
                if (resendCountdown > 0) return;
                setSubmitting(true);
                setMessage(null);
                try {
                  await requestBindEmailCode(email.trim());
                  setResendCountdown(EMAIL_BIND_COOLDOWN_SECONDS);
                  setMessage({ tone: "success", text: "验证码已重新发送。" });
                } catch (error) {
                  setMessage({
                    tone: "error",
                    text: error instanceof Error ? error.message : "验证码发送失败",
                  });
                } finally {
                  setSubmitting(false);
                }
              }}
              type="button"
            >
              {resendCountdown > 0 ? `${resendCountdown}s 后重发` : "重新发送"}
            </button>
          ) : null}
        </div>
      </div>
      {message ? (
        <div
          className={`mx-auto mt-2 max-w-[980px] text-xs ${
            message.tone === "success"
              ? "text-[var(--success)]"
              : "text-[var(--danger)]"
          }`}
          role="status"
        >
          {message.text}
        </div>
      ) : null}
    </form>
  );
}
