"use client";

import { AgentWorkspaceShell } from "./agent-workspace/components";
import { useAgentConversation } from "./agent-workspace/use-agent-conversation";
import { EmailLoginPanel } from "./auth/email-login-panel";
import { useAuthSession } from "./auth/use-auth-session";
import type { AuthUser } from "./auth/auth-types";

export default function Home() {
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

  return <WorkspaceHome user={auth.user} />;
}

function WorkspaceHome({ user }: { user: AuthUser }) {
  const workspace = useAgentConversation(user);

  return (
    <AgentWorkspaceShell
      activeConversation={workspace.activeConversation}
      conversations={workspace.conversations}
      onDelete={workspace.deleteConversation}
      onNew={workspace.startNewConversation}
      onPrompt={workspace.sendMessage}
      onRename={workspace.renameConversation}
      onRetry={workspace.retryLastUserMessage}
      onSelect={workspace.selectConversation}
      onSend={workspace.sendMessage}
      onStop={workspace.stop}
      sendState={workspace.sendState}
      storageWarning={workspace.storageWarning}
    />
  );
}
