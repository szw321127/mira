"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck, UserCircle } from "lucide-react";
import { EmailBindPanel } from "../auth/email-bind-panel";
import { EmailLoginPanel } from "../auth/email-login-panel";
import { useAuthSession } from "../auth/use-auth-session";
import type { AuthUser } from "../auth/auth-types";

export default function AccountPage() {
  const auth = useAuthSession();

  if (auth.status === "checking") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-5 text-[var(--ink)]">
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
          正在验证 Mira 会话
        </div>
      </main>
    );
  }

  if (auth.status === "guest") {
    return <EmailLoginPanel onLogin={auth.setUser} />;
  }

  return <AccountHome onLogout={auth.logout} onUserChange={auth.setUser} user={auth.user} />;
}

function AccountHome({
  onLogout,
  onUserChange,
  user,
}: {
  onLogout: () => Promise<void>;
  onUserChange: (user: AuthUser) => void;
  user: AuthUser;
}) {
  return (
    <main className="min-h-dvh bg-[var(--background)] px-4 py-4 text-[var(--ink)] sm:px-6">
      <div className="mx-auto flex w-full max-w-[920px] flex-col gap-4">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-[650] text-[var(--muted-strong)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
              href="/"
            >
              <ArrowLeft aria-hidden="true" size={15} />
              返回工作区
            </Link>
            <h1 className="mt-4 text-[22px] leading-tight font-[720]">用户信息</h1>
            <p className="mt-1 max-w-[64ch] text-sm leading-6 text-[var(--muted-strong)]">
              管理 Mira 账号、邮箱绑定和当前会话状态。
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-[650] text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)]"
            onClick={() => {
              void onLogout();
            }}
            type="button"
          >
            退出登录
          </button>
        </header>

        <section className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-[9px] bg-[var(--accent-subtle)] text-[var(--accent-strong)]">
                <UserCircle aria-hidden="true" size={19} />
              </span>
              <div className="min-w-0">
                <h2 className="text-base leading-tight font-[700]">账号资料</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  当前登录的 Mira 账号信息
                </p>
              </div>
            </div>

            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <InfoItem label="账号名" value={user.username ?? "未设置"} />
              <InfoItem label="邮箱" value={user.email ?? "未绑定"} />
              <InfoItem label="账号状态" value={formatStatus(user.status)} />
              <InfoItem
                label="登录方式"
                value={user.username ? "账号密码" : "邮箱验证码"}
              />
            </dl>
          </div>

          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-start gap-3">
              <span
                className={`inline-flex h-10 w-10 items-center justify-center rounded-[9px] ${
                  user.email
                    ? "bg-[var(--success-soft)] text-[var(--success)]"
                    : "bg-[var(--warning-soft)] text-[var(--warning)]"
                }`}
              >
                {user.email ? (
                  <CheckCircle2 aria-hidden="true" size={19} />
                ) : (
                  <Mail aria-hidden="true" size={19} />
                )}
              </span>
              <div className="min-w-0">
                <h2 className="text-base leading-tight font-[700]">邮箱绑定</h2>
                <p className="mt-1 text-sm leading-5 text-[var(--muted-strong)]">
                  {user.email
                    ? "邮箱已绑定，可继续使用邮箱验证码登录。"
                    : "绑定邮箱后可使用验证码登录，也方便找回账号。"}
                </p>
              </div>
            </div>
            {user.email ? (
              <div className="mt-4 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-[650] text-[var(--ink)]">
                {user.email}
              </div>
            ) : null}
          </div>
        </section>

        {user.email === null ? <EmailBindPanel onUserChange={onUserChange} /> : null}

        <section className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[9px] bg-[var(--surface-muted)] text-[var(--muted-strong)]">
              <ShieldCheck aria-hidden="true" size={19} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base leading-tight font-[700]">会话安全</h2>
              <p className="mt-1 text-sm leading-5 text-[var(--muted-strong)]">
                当前登录状态由 httpOnly Cookie 保存，退出登录会清除当前会话。
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 min-w-0 truncate text-sm font-[650] text-[var(--ink)]">
        {value}
      </dd>
    </div>
  );
}

function formatStatus(status: AuthUser["status"]) {
  return status === "enabled" ? "正常" : "已禁用";
}
