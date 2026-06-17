import { LanguageModel, ModelMessage } from 'ai';
import {
  coreRules,
  deferredTools,
  PromptBuilder,
  PromptContext,
  sessionContext,
  toolGuide,
} from './context';
import { agentLoop, AgentLoopEvent, IAgentConfig } from './loop';
import { getToolSearchTool, ToolRegistry } from './tools';
import { UsageTracker } from './usage';

type RunLoop = (
  config: IAgentConfig,
) => AsyncGenerator<AgentLoopEvent, void, void>;

export interface CreateGPTHarnessOptions {
  model: LanguageModel;
  registry?: ToolRegistry;
  promptBuilder?: PromptBuilder;
  messages?: ModelMessage[];
  sessionId?: string;
  tokenBudget?: number;
  maxSteps?: number;
  maxRetries?: number;
  tracker?: UsageTracker;
  runLoop?: RunLoop;
}

export function createGPTHarness({
  model,
  registry = new ToolRegistry(),
  promptBuilder = new PromptBuilder().pipe('coreRules', coreRules()),
  messages = [],
  sessionId = 'default',
  tokenBudget,
  maxSteps,
  maxRetries,
  tracker,
  runLoop = agentLoop,
}: CreateGPTHarnessOptions) {
  if (!registry.get('tool_search')) {
    registry.register(getToolSearchTool(registry));
  }

  promptBuilder
    .pipe('toolGuide', toolGuide())
    .pipe('deferredTools', deferredTools())
    .pipe('sessionContext', sessionContext());

  function getPromptContext(): PromptContext {
    return {
      toolCount: registry.getActiveTools().length,
      deferredToolSummary: registry.getDeferredToolSummary(),
      sessionMessageCount: messages.length,
      sessionId,
    };
  }

  async function* runEvents(
    content: string,
  ): AsyncGenerator<AgentLoopEvent, void, void> {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error('input is empty');
    }

    messages.push({ role: 'user', content: trimmed });

    yield* runLoop({
      model,
      registry,
      messages,
      system: promptBuilder.build(getPromptContext()),
      tokenBudget,
      maxSteps,
      maxRetries,
      tracker,
    });
  }

  async function* runText(content: string): AsyncGenerator<string, void, void> {
    for await (const event of runEvents(content)) {
      if (event.type === 'text-delta') {
        yield event.text;
      }
    }
  }

  function reset(): void {
    messages.length = 0;
  }

  async function close(): Promise<void> {
    await registry.closeAllMCP();
  }

  return {
    messages,
    registry,
    promptBuilder,
    getPromptContext,
    runEvents,
    runText,
    reset,
    close,
  };
}

export const createGPTAgentHarness = createGPTHarness;
