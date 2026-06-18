import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const globalCss = readFileSync(
  fileURLToPath(new URL("./globals.css", import.meta.url)),
  "utf8",
);

test("body defaults to a compact 13px font size", () => {
  assert.match(globalCss, /body\s*\{[^}]*font-size:\s*13px;/s);
});
