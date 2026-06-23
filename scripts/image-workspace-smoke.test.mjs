import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const script = readFileSync(new URL("./image-workspace-smoke.mjs", import.meta.url), "utf8");

test("image workspace smoke script requires explicit runtime inputs", () => {
  assert.match(script, /APP_ORIGIN/);
  assert.match(script, /MIRA_USER_COOKIE/);
  assert.match(script, /MIRA_SMOKE_SOURCE_IMAGE/);
});

test("image workspace smoke script exercises provider storage and version flows", () => {
  assert.match(script, /\/api\/image-workspaces/);
  assert.match(script, /\/tasks/);
  assert.match(script, /\/assets/);
  assert.match(script, /\/masks/);
  assert.match(script, /\/edit/);
  assert.match(script, /\/variations/);
  assert.match(script, /\/upscale/);
  assert.match(script, /\/remove-background/);
  assert.match(script, /\/download/);
  assert.match(script, /\/preview/);
});

test("image workspace smoke script avoids printing sensitive cookie values", () => {
  assert.doesNotMatch(script, /console\.(log|error)\([^)]*MIRA_USER_COOKIE/);
  assert.doesNotMatch(script, /console\.(log|error)\([^)]*Cookie/);
});

test("image workspace smoke script does not send raw mask storage keys", () => {
  assert.match(script, /maskId/);
  assert.doesNotMatch(script, /maskKey/);
});
