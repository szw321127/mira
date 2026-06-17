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
