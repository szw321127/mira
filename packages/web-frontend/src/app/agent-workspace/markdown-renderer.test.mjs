import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const chatThreadSource = readFileSync(
  fileURLToPath(new URL("./chat-thread.tsx", import.meta.url)),
  "utf8",
);

const rendererPath = fileURLToPath(
  new URL("./markdown-renderer.tsx", import.meta.url),
);
const mermaidBlockPath = fileURLToPath(
  new URL("./mermaid-diagram-block.tsx", import.meta.url),
);

test("chat thread delegates assistant markdown to the shared renderer", () => {
  assert.match(chatThreadSource, /MarkdownRenderer/);
  assert.doesNotMatch(chatThreadSource, /<XMarkdown/);
});

test("markdown renderer maps mermaid code fences to Ant Design X Mermaid", () => {
  const rendererSource = readFileSync(rendererPath, "utf8");

  assert.match(rendererSource, /MermaidDiagramBlock/);
  assert.match(rendererSource, /components=\{\{[\s\S]*code:/);
  assert.match(rendererSource, /normalizedLang\s*===\s*"mermaid"/);
});

test("mermaid diagram block provides a fullscreen viewer", () => {
  const blockSource = readFileSync(mermaidBlockPath, "utf8");

  assert.match(blockSource, /import\s+\{\s*Mermaid\s*\}\s+from\s+"@ant-design\/x"/);
  assert.match(blockSource, /aria-label="全屏查看图表"/);
  assert.match(blockSource, /role="dialog"/);
  assert.match(blockSource, /aria-modal="true"/);
  assert.match(blockSource, /event\.key\s*===\s*"Escape"/);
  assert.match(blockSource, /fixed inset-0/);
});
