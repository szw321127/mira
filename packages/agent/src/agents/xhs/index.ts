import { LanguageModel, ModelMessage } from 'ai';
import {
  applyDefense,
  deferredTools,
  estimateMessageTokens,
  PromptBuilder,
  PromptContext,
  sessionContext,
  toolGuide,
} from '../../context/index.js';
import { agentLoop } from '../../loop/index.js';
import { getToolSearchTool, ToolRegistry } from '../../tools/index.js';

export { generateOutline } from './outline/index.js';

export function createAgent({
  model,
  registry,
  promptBuilder,
  messages = [],
  sessionId = 'default',
}: {
  model: LanguageModel;
  registry: ToolRegistry;
  promptBuilder: PromptBuilder;
  messages?: ModelMessage[];
  sessionId?: string;
}) {
  registry.register(getToolSearchTool(registry));

  promptBuilder
    .pipe('toolGuide', toolGuide())
    .pipe('deferredTools', deferredTools())
    .pipe('sessionContext', sessionContext());

  function makePromptCtx(): PromptContext {
    return {
      toolCount: registry.getActiveTools().length,
      deferredToolSummary: registry.getDeferredToolSummary(),
      sessionMessageCount: messages.length,
      sessionId: sessionId,
    };
  }

  const timestamps = new Map<number, number>();

  // Apply three-layer defense
  const beforeTokens = estimateMessageTokens(messages);
  console.log(`\n=== 三层即时防线 ===`);
  console.log(`[防线前] ${messages.length} 条消息, ~${beforeTokens} tokens`);

  const defense = applyDefense(messages, timestamps);
  messages = defense.messages;

  return async function* (input: string) {
    const trimmed = input.trim();

    if (!trimmed) {
      throw new Error('input is empty');
    }

    const currentSystem = promptBuilder.build(makePromptCtx());

    const userMsg: ModelMessage = { role: 'user', content: trimmed };
    messages.push(userMsg);
    timestamps.set(messages.length - 1, Date.now());

    applyDefense(messages, timestamps);
    messages = defense.messages;

    const result = agentLoop({
      model,
      registry,
      messages,
      system: currentSystem,
    });

    for await (const event of result) {
      switch (event.type) {
        case 'text-delta': {
          yield event.text;
          break;
        }
      }
    }
  };
}
