import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const globalCss = readFileSync(
  fileURLToPath(new URL("../globals.css", import.meta.url)),
  "utf8",
);

test("markdown theme text is explicitly kept compact", () => {
  assert.match(
    globalCss,
    /\.message-markdown\.x-markdown-light\s*\{[^}]*--font-size:\s*13px;/s,
  );
  assert.match(
    globalCss,
    /\.message-markdown\.x-markdown-light\s+:\s*where\(\s*p,\s*li\s*\)\s*\{[^}]*font-size:\s*13px;/s,
  );
});
