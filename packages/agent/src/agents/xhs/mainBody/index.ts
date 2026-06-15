import { LanguageModel, ModelMessage } from 'ai';
import {
  deferredTools,
  PromptBuilder,
  PromptContext,
  sessionContext,
  toolGuide,
} from '../../../context';
import { agentLoop } from '../../../loop';
import { ToolRegistry } from '../../../tools';
import { articleCoreRules } from './prompt';

export function generateMainBody(
  model: LanguageModel,
  messages: ModelMessage[],
) {
  if (messages.length === 0) {
    throw new Error('No messages provided');
  }
  if (!messages.some((m) => m.role === 'user')) {
    throw new Error('No user messages provided');
  }

  const registry = new ToolRegistry();

  function makePromptCtx(): PromptContext {
    return {
      toolCount: registry.getActiveTools().length,
      deferredToolSummary: registry.getDeferredToolSummary(),
      sessionMessageCount: messages.length,
      sessionId: 'default',
    };
  }

  const promptBuilder = new PromptBuilder()
    .pipe('coreRules', articleCoreRules())
    .pipe('toolGuide', toolGuide())
    .pipe('deferredTools', deferredTools())
    .pipe('sessionContext', sessionContext());

  async function loop() {
    const currentSystem = promptBuilder.build(makePromptCtx());

    return agentLoop({
      model,
      registry,
      messages,
      system: currentSystem,
    });
  }

  return loop();
}
