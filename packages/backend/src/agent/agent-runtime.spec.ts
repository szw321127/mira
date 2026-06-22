import { createAgentRegistry } from "./agent-runtime.js";

describe("createAgentRegistry", () => {
  it("registers web search and URL fetch tools for the chat agent", () => {
    const registry = createAgentRegistry({ tavilyApiKey: "test-tavily-key" });

    expect(registry.get("web_search")).toBeDefined();
    expect(registry.get("fetch_url")).toBeDefined();
  });

  it("does not register local preview tools in production chat", () => {
    const registry = createAgentRegistry({ tavilyApiKey: "test-tavily-key" });

    expect(registry.get("start_preview")).toBeUndefined();
  });
});
