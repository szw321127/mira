import { createHash } from 'node:crypto';

// --- 配置 ---

const HISTORY_SIZE = 30; // 滑动窗口大小
const WARNING_THRESHOLD = 5; // 警告阈值（演示用，生产环境通常是 10）
const CRITICAL_THRESHOLD = 8; // 严重阈值（演示用，生产环境通常是 20）
const BREAKER_THRESHOLD = 10; // 熔断阈值（演示用，生产环境通常是 30）

export interface ToolCallRecord {
  toolName: string;
  argsHash: string;
  resultHash?: string;
  timestamp: number;
}

export type DetectorKind =
  | 'generic_repeat'
  | 'ping_pong'
  | 'global_circuit_breaker';

export type DetectionResult =
  | { stuck: false }
  | {
      stuck: true;
      level: 'warning' | 'critical';
      detector: DetectorKind;
      count: number;
      message: string;
    };

const history: ToolCallRecord[] = [];

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `"${JSON.stringify(key)}":${stableStringify((value as any)[key])}`).join(',')}}`;
}

function hash(input: string) {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export function resetHistory() {
  history.length = 0;
}

function hashResult(result: unknown) {
  return hash(stableStringify(result));
}

function hashToolsCall(toolName: string, params: unknown) {
  return `${toolName}:${hash(stableStringify(params))}`;
}

function getNoProgressStreak(toolName: string, argsHash: string) {
  let streak = 0;
  let lastResultHash: string | undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    const record = history[i];
    if (record.toolName !== toolName || record.argsHash !== argsHash) continue;
    if (!record.resultHash) continue;
    if (!lastResultHash) {
      lastResultHash = record.resultHash;
      streak = 1;
      continue;
    }
    if (record.resultHash !== lastResultHash) break;
    streak++;
  }
  return streak;
}

function getPingPongCount(currentHash: string) {
  if (history.length < 3) return 0;
  const last = history[history.length - 1];
  let otherHash: string | undefined;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].argsHash !== last.argsHash) {
      otherHash = history[i].argsHash;
      break;
    }
  }
  if (!otherHash) return 0;
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const expected = count % 2 === 0 ? last.argsHash : otherHash;
    if (history[i].argsHash !== expected) break;
    count++;
  }
  if (currentHash === otherHash && count >= 2) return count + 1;
  return count;
}

export function recordCall(toolName: string, params: unknown) {
  const argsHash = hashToolsCall(toolName, params);
  history.push({ toolName, argsHash, timestamp: Date.now() });
  if (history.length > HISTORY_SIZE) history.shift();
}

export function recordResult(
  toolName: string,
  params: unknown,
  result: unknown,
) {
  const argsHash = hashToolsCall(toolName, params);
  const resultH = hashResult(result);
  for (let i = history.length - 1; i >= 0; i--) {
    if (
      history[i].toolName === toolName &&
      history[i].argsHash === argsHash &&
      !history[i].resultHash
    ) {
      history[i].resultHash = resultH;
      return;
    }
  }
}

export function detect(toolName: string, params: unknown): DetectionResult {
  const argsHash = hashToolsCall(toolName, params);

  // 1. 通用重复：判断是否无进展：同一个工具、同样的参数、同样的结果，反复调
  const noProgress = getNoProgressStreak(toolName, argsHash);
  if (noProgress >= BREAKER_THRESHOLD) {
    return {
      stuck: true,
      level: 'critical',
      detector: 'global_circuit_breaker',
      count: noProgress,
      message: `[熔断] ${toolName} 已重复 ${noProgress} 次且无进展，强制停止`,
    };
  }

  // 2. 乒乓检测：判断多个工具是否在来回交替
  const pingPong = getPingPongCount(argsHash);
  if (pingPong >= CRITICAL_THRESHOLD) {
    return {
      stuck: true,
      level: 'critical',
      detector: 'ping_pong',
      count: pingPong,
      message: `[熔断] 检测到乒乓循环（${pingPong} 次交替），强制停止`,
    };
  }
  if (pingPong >= WARNING_THRESHOLD) {
    return {
      stuck: true,
      level: 'warning',
      detector: 'ping_pong',
      count: pingPong,
      message: `[警告] 检测到乒乓循环（${pingPong} 次交替），建议换个思路`,
    };
  }

  // 3. 轮询无进展：不断 poll 检查状态，结果一直是 running
  const recentCount = history.filter(
    (h) => h.toolName === toolName && h.argsHash === argsHash,
  ).length;
  if (recentCount >= CRITICAL_THRESHOLD) {
    return {
      stuck: true,
      level: 'critical',
      detector: 'generic_repeat',
      count: recentCount,
      message: `[熔断] ${toolName} 相同参数已调用 ${recentCount} 次，强制停止`,
    };
  }
  if (recentCount >= WARNING_THRESHOLD) {
    return {
      stuck: true,
      level: 'warning',
      detector: 'generic_repeat',
      count: recentCount,
      message: `[警告] ${toolName} 相同参数已调用 ${recentCount} 次，你可能陷入了重复`,
    };
  }

  return { stuck: false };
}
