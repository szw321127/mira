import { LanguageModel, ModelMessage } from 'ai';
import { PromptBuilder } from '../../../context';
import { coreRules } from './prompt';
import { ToolRegistry } from '../../../tools';
import { createAgent } from '..';

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
