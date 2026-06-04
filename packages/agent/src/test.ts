import { type LanguageModel, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createMockModel } from './mock';
import { createInterface } from 'node:readline';
import { agentLoop, type AgentLoopEvent } from './loop';
import {
  fetchUrlTool,
  webFetchTool,
  pickSearchTool,
  ToolRegistry,
} from './tools';

const qwen = createOpenAI({
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.DASHSCOPE_API_KEY,
});

const model: LanguageModel = process.env.DASHSCOPE_API_KEY
  ? qwen.chat('qwen-plus-latest')
  : (createMockModel() as unknown as LanguageModel);

const messages: ModelMessage[] = [];
const rl = createInterface({ input: process.stdin, output: process.stdout });

const SYSTEM = `你是 Super Agent，一个有工具调用能力的 AI 助手。
需要查询信息时，主动使用工具，不要编造数据。
回答要简洁直接。`;
const registry = new ToolRegistry();
registry.register(fetchUrlTool, webFetchTool, pickSearchTool());

function renderAgentLoopEvent(event: AgentLoopEvent): void {
  switch (event.type) {
    case 'text-delta': {
      process.stdout.write(event.text);
      break;
    }
    case 'tool-call': {
      console.log(
        `  [调用: ${event.toolName}(${JSON.stringify(event.input)})]`,
      );
      break;
    }
    case 'tool-result': {
      console.log(`  [结果: ${event.toolName}] ${event.preview}`);
      break;
    }
    case 'detection': {
      console.log(`  ${event.message}`);
      break;
    }
    case 'retry': {
      console.log(
        `  [重试] 第 ${event.attempt}/${event.maxRetries} 次，${event.delayMs}ms 后...`,
      );
      break;
    }
    case 'token-usage': {
      console.log(
        `  [Token] ${event.totalTokens}/${event.tokenBudget} (${event.percent}%)`,
      );
      break;
    }
    case 'stop': {
      if (event.reason !== 'done' && event.message) {
        console.log(`\n[${event.message}]`);
      }
      break;
    }
  }
}

function ask() {
  rl.question('\nYou: ', (input) => {
    void handleInput(input).catch((error: unknown) => {
      console.error(error);
      ask();
    });
  });
}

async function handleInput(input: string): Promise<void> {
  const trimmed = input.trim();
  if (!trimmed || trimmed === 'exit') {
    console.log('Bye!');
    rl.close();
    return;
  }

  messages.push({ role: 'user', content: trimmed });

  const result = agentLoop({
    model,
    registry,
    messages,
    system: SYSTEM,
  });

  for await (const event of result) {
    renderAgentLoopEvent(event);
  }

  console.log();

  ask();
}

console.log('Super Agent v0.2 — Agent Loop (type "exit" to quit)\n');
ask();
