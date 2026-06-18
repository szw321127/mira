import type { ChatMessage } from "./types";

export function shouldRenderMarkdown(role: ChatMessage["role"]) {
  return role === "assistant";
}
