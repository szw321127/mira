import {
  createGPTAgentHarness,
  fetchUrlTool,
  pickSearchTool,
  ToolRegistry,
  type CreateGPTHarnessOptions
} from "@rednote/agent";
import type { RuntimeSearchConfig } from "../admin/runtime-secrets.service.js";

export type AgentHarnessFactory = (
  options: CreateGPTHarnessOptions
) => ReturnType<typeof createGPTAgentHarness>;

export function createAgentRegistry(config: RuntimeSearchConfig) {
  const registry = new ToolRegistry();
  registry.register(
    pickSearchTool({ tavilyApiKey: config.tavilyApiKey }),
    fetchUrlTool
  );
  return registry;
}

export { createGPTAgentHarness };
