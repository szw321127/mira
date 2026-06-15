import {
  LanguageModel,
  LanguageModelUsage,
  ModelMessage,
  streamText,
} from 'ai';
import { ToolRegistry } from '../tools';
import { calculateDelay, isRetryable, sleep } from './retry';
import {
  detect,
  recordCall,
  recordResult,
  resetHistory,
  type DetectorKind,
} from './detection';
import { normalizeUsage, UsageTracker } from '../usage';

export interface IAgentConfig {
  model: LanguageModel;
  registry: ToolRegistry;
  messages: ModelMessage[];
  system: string;
  tokenBudget?: number;
  maxSteps?: number;
  maxRetries?: number;
  tracker?: UsageTracker;
}

export type AgentLoopEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolName: string; input: unknown }
  | {
      type: 'tool-result';
      toolName: string;
      output: unknown;
      preview: string;
    }
  | {
      type: 'detection';
      level: 'warning' | 'critical';
      detector: DetectorKind;
      count: number;
      message: string;
    }
  | {
      type: 'retry';
      attempt: number;
      maxRetries: number;
      delayMs: number;
      error: string;
    }
  | {
      type: 'token-cost';
      detail: string;
      cost: string;
    }
  | {
      type: 'token-usage';
      totalTokens: number;
      tokenBudget: number;
      percent: string;
    }
  | {
      type: 'stop';
      reason: 'loop-detected' | 'token-budget' | 'max-step' | 'done';
      message?: string;
    };

export async function* agentLoop(
  config: IAgentConfig,
): AsyncGenerator<AgentLoopEvent, void, void> {
  const {
    model,
    registry,
    messages,
    system,
    tokenBudget = 1024 * 1024 * 256,
    maxSteps = Number.MAX_SAFE_INTEGER,
    maxRetries = 10,
    tracker,
  } = config;

  let step = 0;
  let totalTokens = 0;
  resetHistory();

  while (step < maxSteps) {
    step++;

    let hasToolCall = false;
    let shouldBreak = false;
    let lastToolCall: { name: string; input: unknown } | null = null;
    let stepResponse: { messages: ModelMessage[] } | undefined;
    let stepUsage: LanguageModelUsage | undefined;

    for (let attempt = 1; ; attempt++) {
      try {
        const result = streamText({
          model,
          system,
          tools: registry.toAISDKFormat(),
          messages,
          maxRetries: 0,
          providerOptions: { openai: { parallelToolCalls: true } },
          onError: () => {},
        });

        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta': {
              yield { type: 'text-delta', text: part.text };
              break;
            }
            case 'tool-call': {
              hasToolCall = true;
              lastToolCall = { name: part.toolName, input: part.input };
              yield {
                type: 'tool-call',
                toolName: part.toolName,
                input: part.input,
              };

              const detection = detect(part.toolName, part.input);
              if (detection.stuck) {
                yield {
                  type: 'detection',
                  level: detection.level,
                  detector: detection.detector,
                  count: detection.count,
                  message: detection.message,
                };
                if (detection.level === 'critical') {
                  shouldBreak = true;
                } else {
                  messages.push({
                    role: 'user' as const,
                    content: `[系统提醒] ${detection.message}。请换一个思路解决问题，不要重复同样的操作。`,
                  });
                }
              }
              recordCall(part.toolName, part.input);
              break;
            }
            case 'tool-result': {
              const output =
                typeof part.output === 'string'
                  ? part.output
                  : JSON.stringify(part.output);
              const preview =
                output.length > 120 ? output.slice(0, 120) + '...' : output;
              yield {
                type: 'tool-result',
                toolName: part.toolName,
                output: part.output,
                preview,
              };
              if (lastToolCall) {
                recordResult(
                  lastToolCall.name,
                  lastToolCall.input,
                  part.output,
                );
              }
              break;
            }
          }
        }
        stepResponse = await result.response;
        stepUsage = await result.usage;
        break;
      } catch (error) {
        if (attempt > maxRetries || !isRetryable(error as Error)) throw error;
        const delay = calculateDelay(attempt);
        yield {
          type: 'retry',
          attempt,
          maxRetries,
          delayMs: delay,
          error: error instanceof Error ? error.message : String(error),
        };
        await sleep(delay);
        hasToolCall = false;
        shouldBreak = false;
        lastToolCall = null;
      }
    }

    if (shouldBreak) {
      yield {
        type: 'stop',
        reason: 'loop-detected',
        message: '循环检测触发，Agent 已停止',
      };
      break;
    }

    if (!stepResponse || !stepUsage) {
      throw new Error('Agent loop did not receive a model response.');
    }

    messages.push(...stepResponse.messages);

    // 把 usage 喂给 tracker；tracker 内部按四类 token 分别累加并算 cost
    const norm = normalizeUsage(stepUsage);
    const modelRecord = model as { modelId?: unknown };
    const modelId =
      typeof modelRecord.modelId === 'string' ? modelRecord.modelId : 'mock-model';
    const stepRecord = tracker?.record(modelId, norm);
    totalTokens +=
      norm.inputTokens +
      norm.outputTokens +
      norm.cacheReadTokens +
      norm.cacheWriteTokens;

    // cache 命中时才打印一行简洁状态，让 cache hit 立刻可见
    if (stepRecord && (norm.cacheReadTokens > 0 || norm.cacheWriteTokens > 0)) {
      // const tag =
      //   norm.cacheReadTokens > 0
      //     ? `\x1b[38;5;36m✓ cache hit\x1b[0m`
      //     : `\x1b[38;5;220m✎ cache write\x1b[0m`;
      const detail =
        norm.cacheReadTokens > 0
          ? `read ${norm.cacheReadTokens}`
          : `write ${norm.cacheWriteTokens}`;
      // console.log(
      //   `  [${tag}] ${detail} tokens · 本步 $${stepRecord.cost.toFixed(5)}`,
      // );
      yield {
        type: 'token-cost',
        detail,
        cost: stepRecord.cost.toFixed(5),
      };
    }

    if (totalTokens > tokenBudget * 0.9) {
      yield {
        type: 'token-usage',
        totalTokens,
        tokenBudget,
        percent: `Math.round((totalTokens / tokenBudget) * 100)}%`,
      };
    }
    if (totalTokens > tokenBudget) {
      yield {
        type: 'stop',
        reason: 'token-budget',
        message: 'Token 预算耗尽',
      };
      break;
    }

    if (!hasToolCall) {
      yield { type: 'stop', reason: 'done' };
      break;
    }
  }

  if (step >= maxSteps) {
    yield { type: 'stop', reason: 'max-step', message: '达到最大步数' };
  }
}
