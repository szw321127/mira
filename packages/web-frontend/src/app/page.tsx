"use client";

import { AgentWorkspaceShell } from "./agent-workspace/components";
import { useAgentConversation } from "./agent-workspace/use-agent-conversation";

export default function Home() {
  const workspace = useAgentConversation();

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
