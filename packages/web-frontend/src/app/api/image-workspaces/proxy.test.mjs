import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const routeDir = dirname(fileURLToPath(import.meta.url));

function readRoute(relativePath) {
  const filePath = join(routeDir, relativePath);
  assert.equal(existsSync(filePath), true, `${relativePath} should exist`);
  return readFileSync(filePath, "utf8");
}

test("image workspace root route proxies list and create requests", () => {
  const source = readRoute("route.ts");

  assert.match(source, /proxyBackendRequest/);
  assert.match(source, /"image-workspaces"/);
  assert.match(source, /export async function GET/);
  assert.match(source, /export async function POST/);
});

test("image workspace detail route proxies get rename and delete requests", () => {
  const source = readRoute("[id]/route.ts");

  assert.match(source, /proxyBackendRequest/);
  assert.match(source, /params:\s*Promise<\s*\{[\s\S]*id:\s*string;?[\s\S]*\}\s*>/);
  assert.match(source, /encodeURIComponent\(id\)/);
  assert.match(source, /export async function GET/);
  assert.match(source, /export async function PATCH/);
  assert.match(source, /export async function DELETE/);
});

test("image workspace canvas and task routes proxy nested backend paths", () => {
  const canvasSource = readRoute("[id]/canvas/route.ts");
  const tasksSource = readRoute("[id]/tasks/route.ts");
  const assetsSource = readRoute("[id]/assets/route.ts");
  const streamSource = readRoute("[id]/tasks/[taskId]/stream/route.ts");
  const cancelSource = readRoute("[id]/tasks/[taskId]/cancel/route.ts");
  const retrySource = readRoute("[id]/tasks/[taskId]/retry/route.ts");

  assert.match(canvasSource, /\/canvas/);
  assert.match(canvasSource, /export async function PATCH/);
  assert.match(tasksSource, /\/tasks/);
  assert.match(tasksSource, /export async function POST/);
  assert.match(assetsSource, /\/assets/);
  assert.match(assetsSource, /export async function POST/);
  assert.match(streamSource, /\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/stream/);
  assert.match(streamSource, /export async function GET/);
  assert.match(cancelSource, /\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/cancel/);
  assert.match(cancelSource, /export async function POST/);
  assert.match(retrySource, /\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/retry/);
  assert.match(retrySource, /export async function POST/);
  assert.match(
    `${canvasSource}\n${tasksSource}\n${assetsSource}\n${streamSource}\n${cancelSource}\n${retrySource}`,
    /proxyBackendRequest/,
  );
});
