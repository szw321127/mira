import { Inject, Injectable, Optional } from "@nestjs/common";
import type { LanguageModel, ModelMessage } from "ai";
import type { ToolRegistry } from "@rednote/agent";
import type { AgentChatRequest, AgentStreamEvent } from "./agent.types.js";
import { normalizeAgentEvent } from "./agent-event-normalizer.js";
import { createAgentModel } from "./model-factory.js";
import {
  createAgentRegistry,
  createGPTAgentHarness,
  type AgentHarnessFactory
} from "./agent-runtime.js";

type RegistryFactory = () => ToolRegistry;
type ModelFactory = () => LanguageModel;

type AgentServiceDependencies = {
  createModel?: ModelFactory;
  createRegistry?: RegistryFactory;
  createHarness?: AgentHarnessFactory;
};

export const AGENT_SERVICE_DEPS = Symbol("AGENT_SERVICE_DEPS");

@Injectable()
export class AgentService {
  private readonly createModel: ModelFactory;
  private readonly createRegistry: RegistryFactory;
  private readonly createHarness: AgentHarnessFactory;

  constructor(
    @Optional()
    @Inject(AGENT_SERVICE_DEPS)
    dependencies: AgentServiceDependencies = {}
  ) {
    this.createModel = dependencies.createModel ?? createAgentModel;
    this.createRegistry = dependencies.createRegistry ?? createAgentRegistry;
    this.createHarness = dependencies.createHarness ?? createGPTAgentHarness;
  }

  async *streamChat(
    request: AgentChatRequest
  ): AsyncGenerator<AgentStreamEvent, void, void> {
    const lastUserMessage = [...request.messages].reverse().find((message) => {
      return message.role === "user" && message.content.trim();
    });

    if (!lastUserMessage) {
      throw new Error("Message is required.");
    }

    const model = this.createModel();
    const registry = this.createRegistry();
    const harness = this.createHarness({
      model,
      registry,
      messages: this.getHistoryBeforeMessage(request.messages, lastUserMessage),
      sessionId: request.conversationId,
      maxSteps: Number(process.env.AGENT_MAX_STEPS ?? 8)
    });

    let eventIndex = 0;

    for await (const event of harness.runEvents(lastUserMessage.content)) {
      const normalized = normalizeAgentEvent(event, eventIndex);
      eventIndex += 1;
      yield normalized;
    }
  }

  private getHistoryBeforeMessage(
    messages: AgentChatRequest["messages"],
    target: AgentChatRequest["messages"][number]
  ): ModelMessage[] {
    const index = messages.lastIndexOf(target);
    return messages.slice(0, index).map((message) => ({
      role: message.role,
      content: message.content
    }));
  }
}
