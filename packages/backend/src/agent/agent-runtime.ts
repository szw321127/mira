import {
  createGPTAgentHarness,
  pickSearchTool,
  ToolRegistry,
  type CreateGPTHarnessOptions
} from "@rednote/agent";

export type AgentHarnessFactory = (
  options: CreateGPTHarnessOptions
) => ReturnType<typeof createGPTAgentHarness>;

export function createAgentRegistry() {
  const registry = new ToolRegistry();
  registry.register(pickSearchTool());
  return registry;
}

export { createGPTAgentHarness };
