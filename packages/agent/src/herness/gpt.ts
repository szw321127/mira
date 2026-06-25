import { LanguageModel, ModelMessage, UserContent } from 'ai';
import {
  applyDefense,
  coreRules,
  deferredTools,
  estimateTokens,
  microcompact,
  PromptBuilder,
  PromptContext,
  sessionContext,
  summarize,
  toolGuide,
} from '../context/index.js';
import { agentLoop, AgentLoopEvent, IAgentConfig } from '../loop/index.js';
import { ToolRegistry, getToolSearchTool } from '../tools/index.js';
import { UsageTracker } from '../usage/index.js';

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

export function createGPTAgentHarness({
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
  let summary = '';
  const timestamps = new Map<number, number>();
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
    content: UserContent,
  ): AsyncGenerator<AgentLoopEvent, void, void> {
    const normalizedContent = normalizeUserContent(content);
    if (!normalizedContent) {
      throw new Error('input is empty');
    }

    messages.push({ role: 'user', content: normalizedContent });
    const beforeLen = messages.length - 1;

    try {
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
    } finally {
      const now = Date.now();
      for (let i = beforeLen; i < messages.length; i++) {
        timestamps.set(i, now);
      }
      const currentTokens = estimateTokens(messages);
      if (currentTokens > 50 * 1024) {
        console.log(`\n  [压缩检查] ~${currentTokens} tokens, 触发压缩...`);
        const mc2 = microcompact(messages);
        messages = mc2.messages;
        if (mc2.cleared > 0)
          console.log(`  [Microcompact] 清理了 ${mc2.cleared} 个工具结果`);

        const comp2 = await summarize(model, messages, summary);
        if (comp2.compressedCount > 0) {
          messages.splice(0, messages.length, ...comp2.messages);
          summary = comp2.summary;
          console.log(
            `  [Summarization] 压缩了 ${comp2.compressedCount} 条消息, ~${estimateTokens(messages)} tokens`,
          );
        }
      }
      const defense = applyDefense(messages, timestamps);
      messages.splice(0, messages.length, ...defense.messages);
    }
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

function normalizeUserContent(content: UserContent): UserContent | null {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed ? trimmed : null;
  }

  const hasContent = content.some((part) => {
    return part.type === 'text'
      ? part.text.trim().length > 0
      : part.type === 'image' || part.type === 'file';
  });
  return hasContent ? content : null;
}
