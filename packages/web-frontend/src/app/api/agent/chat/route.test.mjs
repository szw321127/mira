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

test("chat route registers the web search tool", () => {
  assert.match(routeSource, /\bpickSearchTool\b/);
  assert.match(routeSource, /registry\.register\(pickSearchTool\(\)\)/);
});

test("chat route connects models through the GPT agent harness", () => {
  assert.match(routeSource, /\bcreateGPTAgentHarness\b/);
  assert.doesNotMatch(routeSource, /\bagentLoop\s*\(/);
});

test("chat route leaves prompt assembly to the GPT agent harness", () => {
  assert.doesNotMatch(routeSource, /\bMIRA_SYSTEM_PROMPT\b/);
  assert.doesNotMatch(routeSource, /\bPromptBuilder\b/);
  assert.doesNotMatch(routeSource, /\bcoreRules\b/);
  assert.doesNotMatch(routeSource, /\bpromptBuilder\s*:/);
});

test("chat route returns setup-oriented guidance when model config is missing", () => {
  assert.match(routeSource, /需要配置模型后才能运行 agent/);
  assert.match(routeSource, /packages\/web-frontend\/\.env\.local/);
  assert.match(routeSource, /AGENT_MODEL_BASE_URL/);
  assert.match(routeSource, /AGENT_MODEL_API_KEY/);
  assert.match(routeSource, /AGENT_MODEL_NAME/);
  assert.match(routeSource, /NEXT_PUBLIC_/);
});
