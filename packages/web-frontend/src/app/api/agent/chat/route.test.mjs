import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const routeSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "route.ts"),
  "utf8",
);

test("chat route does not expose project context or filesystem tools", () => {
  assert.doesNotMatch(
    routeSource,
    /\b(readFileTool|listDirectoryTool|globTool|grepTool)\b/,
  );
  assert.doesNotMatch(routeSource, /\bPROJECT_CONTEXT\b/);
  assert.doesNotMatch(routeSource, /\bproject_context\b/);
});

test("chat route proxies agent requests to the backend", () => {
  assert.match(routeSource, /BACKEND_AGENT_BASE_URL/);
  assert.match(routeSource, /fetch\(/);
  assert.match(routeSource, /\/agent\/chat/);
});

test("chat route uses the shared backend base URL and forwards cookies", () => {
  assert.match(
    routeSource,
    /import\s*\{\s*BACKEND_AGENT_BASE_URL\s*\}\s*from\s*"[^"]*shared\/backend-proxy"/,
  );
  assert.match(routeSource, /request\.headers\.get\("cookie"\)/);
  assert.match(routeSource, /headers\.set\("Cookie", cookie\)/);
});

test("chat route leaves models and tools in the backend service", () => {
  assert.doesNotMatch(routeSource, /\bcreateGPTAgentHarness\b/);
  assert.doesNotMatch(routeSource, /\bpickSearchTool\b/);
  assert.doesNotMatch(routeSource, /\bToolRegistry\b/);
  assert.doesNotMatch(routeSource, /\bagentLoop\s*\(/);
});

test("chat route leaves prompt assembly to the GPT agent harness", () => {
  assert.doesNotMatch(routeSource, /\bMIRA_SYSTEM_PROMPT\b/);
  assert.doesNotMatch(routeSource, /\bPromptBuilder\b/);
  assert.doesNotMatch(routeSource, /\bcoreRules\b/);
  assert.doesNotMatch(routeSource, /\bpromptBuilder\s*:/);
});

test("chat route returns setup-oriented guidance when model config is missing", () => {
  assert.match(routeSource, /无法连接 Mira 后端服务/);
  assert.match(routeSource, /BACKEND_AGENT_BASE_URL/);
  assert.match(routeSource, /NEXT_PUBLIC_/);
});
