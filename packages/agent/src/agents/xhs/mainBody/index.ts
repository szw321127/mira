import { LanguageModel, ModelMessage } from 'ai';
import { PromptBuilder } from '../../../context';
import { coreRules } from './prompt';
import { ToolRegistry } from '../../../tools';
import { createOpenAI } from '@ai-sdk/openai';
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

const qwen = createOpenAI({
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: 'sk-d15343814ffc48d1902a6ddd12c8d25e',
});

const model = qwen.chat('qwen-plus-latest');

const loop = generateOutline(model);

for await (const event of loop('写一篇关于微胖男孩的穿搭指南')) {
  switch (event.type) {
    case 'text-delta': {
      process.stdout.write(event.text);
      break;
    }
  }
}

// console.log()

// messages.push({
//   role: 'user',
//   content: '换一批',
// });

// const result1 = await generateOutline(model, messages);
// for await (const event of result1) {
//   switch (event.type) {
//     case 'text-delta': {
//       process.stdout.write(event.text);
//       break;
//     }
//   }
// }
