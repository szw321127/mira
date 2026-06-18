import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const routeSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "proxy.ts"),
  "utf8",
);

test("admin proxy targets backend admin routes", () => {
  assert.match(routeSource, /BACKEND_AGENT_BASE_URL/);
  assert.match(routeSource, /\/admin\//);
});

test("admin proxy forwards cookies and preserves set-cookie", () => {
  assert.match(routeSource, /request\.headers\.get\("cookie"\)/);
  assert.match(routeSource, /set-cookie/);
});

test("admin proxy does not import backend admin code into the frontend", () => {
  assert.doesNotMatch(routeSource, /@rednote\/backend/);
  assert.doesNotMatch(routeSource, /AdminService/);
});
