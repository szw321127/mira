"use client";

import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { loadAdminSecrets, loadInitialAdminState, logoutAdmin } from "./admin-api";
import { AdminLoginPanel } from "./admin-login-panel";
import { AdminPasswordPanel } from "./admin-password-panel";
import { AdminSecretsPanel } from "./admin-secrets-panel";
import type { AdminSession, ManagedSecret } from "./admin-types";
import { AdminUsersPanel } from "./admin-users-panel";

type LoadState = "checking" | "guest" | "ready";

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
    await logoutAdmin().catch(() => undefined);
    setSession(null);
    setSecrets([]);
    setLoadState("guest");
  }

  async function refreshSecrets() {
    setSecrets(await loadAdminSecrets().catch(() => []));
  }

  if (loadState === "checking") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-6 text-[var(--ink)]">
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted-strong)]">
          正在验证管理员会话
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <AdminLoginPanel
        message={message}
        onLogin={(nextSession) => {
          setSession(nextSession);
          setLoadState("ready");
          setMessage("");
          void refreshSecrets();
        }}
        onMessage={setMessage}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-[var(--background)] text-[var(--ink)]">
      <header className="border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--background)_82%,var(--surface))]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-[650] tracking-[0.12em] text-[var(--accent-strong)] uppercase">
              <ShieldCheck aria-hidden="true" size={15} />
              Mira Admin
            </div>
            <h1 className="mt-2 text-xl leading-tight font-[720]">
              账号、权限与 Key 管理
            </h1>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-[650] transition-colors hover:bg-[var(--surface-muted)]"
            onClick={() => void logout()}
            type="button"
          >
            <LogOut aria-hidden="true" size={16} />
            退出
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-5 py-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <section className="h-fit rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 text-sm font-[700]">
            <UserRound aria-hidden="true" size={17} />
            账号信息
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--muted-strong)]">当前管理员</dt>
              <dd className="mt-1 font-[650]">{session.username}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted-strong)]">会话</dt>
              <dd className="mt-1 text-[var(--success)]">
                已通过 httpOnly Cookie 保护
              </dd>
            </div>
          </dl>
          <AdminPasswordPanel onMessage={setMessage} />
        </section>

        <div className="grid min-w-0 gap-4">
          <AdminUsersPanel onMessage={setMessage} />
          <AdminSecretsPanel
            onMessage={setMessage}
            onSecrets={setSecrets}
            secrets={secrets}
          />
        </div>
      </div>

      {message ? (
        <div className="fixed right-4 bottom-4 max-w-[min(360px,calc(100vw-32px))] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)]">
          {message}
        </div>
      ) : null}
    </main>
  );
}
