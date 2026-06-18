import { LanguageModel, ModelMessage } from 'ai';
import { PromptBuilder } from '../../../context/index.js';
import { coreRules } from './prompt.js';
import { ToolRegistry } from '../../../tools/index.js';
import { createAgent } from '../index.js';

export function generateOutline(model: LanguageModel) {
  const registry = new ToolRegistry();

  const promptBuilder = new PromptBuilder().pipe('coreRules', coreRules(3));

  const messages: ModelMessage[] = [];

  return createAgent({
    model,
    promptBuilder,
    registry,
    messages,
  });
}
