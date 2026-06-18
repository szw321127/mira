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
  getToolSearchTool,
  grepTool,
  bashTool,
  editFileTool,
  globTool,
  listDirectoryTool,
  readFileTool,
  writeFileTool,
  createMemoryTool,
} from './tools';
import { SessionStore } from './session';
import {
  PromptBuilder,
  PromptContext,
  applyDefense,
  coreRules,
  deferredTools,
  sessionContext,
  // estimateTokens,
  // microcompact,
  // summarize,
  toolGuide,
  estimateMessageTokens,
} from './context';
import { UsageTracker } from './usage';
import {
  CommandContext,
  createDispatcher,
  debugCommands,
  contextCommands,
  memoryCommands,
} from './commands';
import { MemoryStore } from './memory';

const qwen = createOpenAI({
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.DASHSCOPE_API_KEY,
});

const model: LanguageModel = process.env.DASHSCOPE_API_KEY
  ? qwen.chat('qwen-plus-latest')
  : (createMockModel() as unknown as LanguageModel);

const rl = createInterface({ input: process.stdin, output: process.stdout });

const registry = new ToolRegistry();
registry.register(
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  editFileTool,
  globTool,
  grepTool,
  bashTool,
  fetchUrlTool,
  webFetchTool,
  pickSearchTool(),
  getToolSearchTool(registry),
);

// ── Memory ────────────────────────────────
const memoryStore = new MemoryStore('.');
memoryStore.init();
registry.register(createMemoryTool(memoryStore));

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
      console.log(event.error);
      break;
    }
    case 'token-cost': {
      console.log(`${event.detail}  [cost] $${event.cost}`);
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

// ── Commands ────────────────────────────────
const dispatch = createDispatcher([
  ...debugCommands,
  ...contextCommands,
  ...memoryCommands,
]);

async function main() {
  const isContinue = process.argv.includes('--continue');
  const store = new SessionStore('default');
  let messages: ModelMessage[] = [];
  const timestamps = new Map<number, number>();
  const tracker = new UsageTracker('.usage/today.jsonl');

  // Inject fake history with varied ages

  if (isContinue && store.exists()) {
    messages = store.load();
    console.log(`[Session] 恢复会话，${messages.length} 条历史消息`);
  }

  // Apply three-layer defense
  const beforeTokens = estimateMessageTokens(messages);
  console.log(`\n=== 三层即时防线 ===`);
  console.log(`[防线前] ${messages.length} 条消息, ~${beforeTokens} tokens`);

  const defense = applyDefense(messages, timestamps);
  messages = defense.messages;
  console.log(`[Layer 2: 截断] ${defense.truncated} 个超长结果被截断`);
  console.log(
    `[Layer 3: TTL] ${defense.softPruned} 个软修剪, ${defense.hardPruned} 个硬清除`,
  );
  console.log(
    `[防线后] ${messages.length} 条消息, ~${defense.tokenEstimate} tokens (节省 ${beforeTokens - defense.tokenEstimate})`,
  );
  console.log(`====================\n`);

  // let summary = '';

  // // ── 压缩演示 ──
  // const beforeTokens = estimateTokens(messages);
  // console.log(`\n[压缩前] ${messages.length} 条消息, ~${beforeTokens} tokens`);

  // // Layer 1: Microcompact
  // const mc = microcompact(messages);
  // messages = mc.messages;
  // const afterMCTokens = estimateTokens(messages);
  // console.log(
  //   `[Layer 1: Microcompact] 清理了 ${mc.cleared} 个工具结果, ~${afterMCTokens} tokens`,
  // );

  // // Layer 2: LLM Summarization
  // const compResult = await summarize(model, messages, summary);
  // messages = compResult.messages;
  // summary = compResult.summary;
  // const afterSumTokens = estimateTokens(messages);
  // if (compResult.compressedCount > 0) {
  //   console.log(
  //     `[Layer 2: Summarization] 压缩了 ${compResult.compressedCount} 条消息, ~${afterSumTokens} tokens`,
  //   );
  //   console.log(`[摘要预览] ${summary.slice(0, 150)}...`);
  // } else {
  //   console.log(`[Layer 2: Summarization] 未触发（消息量不够）`);
  // }

  // console.log(
  //   `[压缩后] ${messages.length} 条消息, ~${afterSumTokens} tokens (节省 ${beforeTokens - afterSumTokens} tokens)\n`,
  // );

  // Clear injected history for chat — compression demo is done
  messages = [];
  timestamps.clear();

  const builder = new PromptBuilder()
    .pipe('coreRules', coreRules())
    .pipe('toolGuide', toolGuide())
    .pipe('deferredTools', deferredTools())
    .pipe('memoryContext', () => memoryStore.buildPromptSection())
    .pipe('sessionContext', sessionContext());

  function makePromptCtx(): PromptContext {
    return {
      toolCount: registry.getActiveTools().length,
      deferredToolSummary: registry.getDeferredToolSummary(),
      sessionMessageCount: messages.length,
      sessionId: 'default',
    };
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
    const ctx: CommandContext = {
      messages,
      timestamps,
      registry,
      builder,
      tracker,
      sessionStore: store,
      model,
      makePromptCtx,
      ask,
      memoryStore,
    };
    const handled = dispatch(trimmed, ctx);
    if (handled === 'async') return;
    if (handled) {
      ask();
      return;
    }

    const userMsg: ModelMessage = { role: 'user', content: trimmed };
    messages.push(userMsg);
    store.append(userMsg);

    const currentSystem = builder.build(makePromptCtx());
    const beforeLen = messages.length;
    const result = agentLoop({
      model,
      registry,
      messages,
      system: currentSystem,
      tracker,
    });

    for await (const event of result) {
      renderAgentLoopEvent(event);
    }

    // 持久化本轮新增的消息（agent loop 会往 messages 里 push assistant/tool 消息）
    const newMessages = messages.slice(beforeLen);
    const now = Date.now();
    for (let i = beforeLen; i < messages.length; i++) {
      timestamps.set(i, now);
    }
    store.appendAll(newMessages);

    // Check if compaction needed after each turn
    // const currentTokens = estimateTokens(messages);
    // if (currentTokens > 4000) {
    //   console.log(`\n  [压缩检查] ~${currentTokens} tokens, 触发压缩...`);
    //   const mc2 = microcompact(messages);
    //   messages = mc2.messages;
    //   if (mc2.cleared > 0)
    //     console.log(`  [Microcompact] 清理了 ${mc2.cleared} 个工具结果`);

    //   const comp2 = await summarize(model, messages, summary);
    //   if (comp2.compressedCount > 0) {
    //     messages = comp2.messages;
    //     summary = comp2.summary;
    //     console.log(
    //       `  [Summarization] 压缩了 ${comp2.compressedCount} 条消息, ~${estimateTokens(messages)} tokens`,
    //     );
    //   }
    // }
    // Apply defense after each turn
    const status = estimateMessageTokens(messages);
    console.log(`  [Token] ~${status} tokens`);
    const defense = applyDefense(messages, timestamps);
    messages = defense.messages;

    ask();
  }

  console.log('Super Agent v0.11 — Memory System (type "exit" to quit)');
  console.log('快捷命令：');
  console.log('  /memory         — 查看所有记忆');
  console.log('  /memory search  — 搜索记忆');
  console.log('  /context        — 终端里看 context 占用矩阵');
  console.log('  /usage          — 累计 token 用量和成本');
  console.log('  status          — 当前消息数、token 和记忆数');
  console.log('');
  console.log(`  已加载 ${memoryStore.list().length} 条历史记忆`);
  console.log('');
  ask();
}

main();
