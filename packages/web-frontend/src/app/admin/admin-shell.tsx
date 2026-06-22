"use client";

import { useEffect, useState } from "react";
import { loadAdminSecrets, loadInitialAdminState, logoutAdmin } from "./admin-api";
import { AdminLoginPanel } from "./admin-login-panel";
import {
  AdminNavigation,
  type AdminSection,
  isAdminSection,
} from "./admin-navigation";
import { AdminOverviewPanel } from "./admin-overview-panel";
import { AdminSectionFrame } from "./admin-section-frame";
import { AdminSecurityPanel } from "./admin-security-panel";
import { AdminSecretsPanel } from "./admin-secrets-panel";
import type { AdminSession, ManagedSecret } from "./admin-types";
import { AdminUsersPanel } from "./admin-users-panel";

type LoadState = "checking" | "guest" | "ready";

export function AdminShell() {
  const [loadState, setLoadState] = useState<LoadState>("checking");
  const [session, setSession] = useState<AdminSession | null>(null);
  const [secrets, setSecrets] = useState<ManagedSecret[]>([]);
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
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

  useEffect(() => {
    function syncSectionFromHash() {
      const sectionFromHash = window.location.hash.replace("#", "");
      if (isAdminSection(sectionFromHash)) {
        setActiveSection(sectionFromHash);
      }
    }

    const animationFrame = window.requestAnimationFrame(syncSectionFromHash);
    window.addEventListener("hashchange", syncSectionFromHash);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("hashchange", syncSectionFromHash);
    };
  }, []);

  function selectSection(section: AdminSection) {
    setActiveSection(section);
    window.history.replaceState(null, "", `#${section}`);
  }

  async function logout() {
    await logoutAdmin().catch(() => undefined);
    setSession(null);
    setSecrets([]);
    setLoadState("guest");
  }

  async function refreshSecrets() {
    setSecrets(await loadAdminSecrets().catch(() => []));
  }

  function renderActiveSection() {
    if (!session) return null;

    if (activeSection === "overview") {
      return (
        <AdminOverviewPanel
          onSelectSection={selectSection}
          secrets={secrets}
          session={session}
        />
      );
    }

    if (activeSection === "users") {
      return <AdminUsersPanel onMessage={setMessage} showHeader={false} />;
    }

    if (activeSection === "secrets") {
      return (
        <AdminSecretsPanel
          onMessage={setMessage}
          onSecrets={setSecrets}
          secrets={secrets}
          showHeader={false}
        />
      );
    }

    return <AdminSecurityPanel onMessage={setMessage} session={session} />;
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
    <main className="min-h-dvh bg-[var(--background)] text-[var(--ink)] lg:flex">
      <AdminNavigation
        activeSection={activeSection}
        onLogout={() => void logout()}
        onSectionChange={selectSection}
        session={session}
      />

      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-5 lg:px-7 lg:py-7">
          <AdminSectionFrame section={activeSection}>
            {renderActiveSection()}
          </AdminSectionFrame>
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
