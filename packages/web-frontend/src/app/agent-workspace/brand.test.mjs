import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const railSource = readFileSync(
  fileURLToPath(new URL("./conversation-rail.tsx", import.meta.url)),
  "utf8",
);

const markPath = fileURLToPath(
  new URL("../../../public/brand/mira-mark.svg", import.meta.url),
);

test("conversation rail uses the official Mira logo asset", () => {
  assert.match(railSource, /\/brand\/mira-mark\.svg/);
  assert.doesNotMatch(railSource, /\bBot\b/);
});

test("Mira mark asset uses the selected F3 no-underline shape", () => {
  assert.equal(existsSync(markPath), true);

  const markSource = readFileSync(markPath, "utf8");
  assert.match(markSource, /viewBox="0 0 72 64"/);
  assert.match(markSource, /M11 51V14l19 24 19-24v37/);
  assert.match(markSource, /M52 17l8-6v42l-8-6/);
  assert.doesNotMatch(markSource, /M25 50h21/);
});
