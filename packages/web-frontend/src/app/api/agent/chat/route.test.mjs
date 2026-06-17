import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const routeSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "route.ts"),
  "utf8",
);

test("chat route exposes only bounded project context tools", () => {
  assert.doesNotMatch(
    routeSource,
    /\b(readFileTool|listDirectoryTool|globTool|grepTool)\b/,
  );
  assert.match(routeSource, /\bproject_context\b/);
});

test("chat route returns setup-oriented guidance when model config is missing", () => {
  assert.match(routeSource, /需要配置模型后才能运行 agent/);
  assert.match(routeSource, /packages\/web-frontend\/\.env\.local/);
  assert.match(routeSource, /AGENT_MODEL_BASE_URL/);
  assert.match(routeSource, /AGENT_MODEL_API_KEY/);
  assert.match(routeSource, /AGENT_MODEL_NAME/);
  assert.match(routeSource, /NEXT_PUBLIC_/);
});
