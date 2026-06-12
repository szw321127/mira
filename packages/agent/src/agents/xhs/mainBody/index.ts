import { LanguageModel, ModelMessage } from 'ai';
import { PromptBuilder, PromptContext } from '../../../context';
import { coreRules, deferredTools, sessionContext, toolGuide } from './prompt';
import { ToolRegistry } from '../../../tools';
import { agentLoop } from '../../../loop';

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
    .pipe('coreRules', coreRules(3))
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

// const qwen = createOpenAI({
//   baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
//   apiKey: 'sk-d15343814ffc48d1902a6ddd12c8d25e',
// });

// const model = qwen.chat('qwen-plus-latest');

// const messages: ModelMessage[] = [
//   {
//     role: 'user',
//     content: '写一篇关于微胖男孩的穿搭指南',
//   },
// ];

// const result = await generateOutline(model, messages);
// for await (const event of result) {
//   switch (event.type) {
//     case 'text-delta': {
//       process.stdout.write(event.text);
//       break;
//     }
//   }
// }

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
