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

test("signed image preview route proxies token previews through the backend", () => {
  const source = readRoute("preview/route.ts");

  assert.match(source, /BACKEND_AGENT_BASE_URL/);
  assert.match(source, /searchParams\.get\("token"\)/);
  assert.match(source, /image-assets\/preview\?token=/);
  assert.match(source, /arrayBuffer\(\)/);
  assert.match(source, /content-type/);
  assert.doesNotMatch(source, /assetId/);
});

test("asset preview routes stream image bytes through the frontend origin", () => {
  const assetPreviewSource = readRoute("[assetId]/preview/route.ts");
  const versionPreviewSource = readRoute(
    "[assetId]/versions/[versionId]/preview/route.ts",
  );

  for (const source of [assetPreviewSource, versionPreviewSource]) {
    assert.match(source, /download/);
    assert.match(source, /proxyImageDownloadPreview/);
    assert.doesNotMatch(source, /Response\.redirect/);
  }
});

test("asset action routes proxy upscale and background removal through the backend", () => {
  const upscaleSource = readRoute("[assetId]/upscale/route.ts");
  const backgroundSource = readRoute("[assetId]/remove-background/route.ts");

  assert.match(upscaleSource, /POST/);
  assert.match(upscaleSource, /image-assets\/\$\{encodeURIComponent\(assetId\)\}\/upscale/);
  assert.match(upscaleSource, /proxyBackendRequest/);
  assert.match(backgroundSource, /POST/);
  assert.match(
    backgroundSource,
    /image-assets\/\$\{encodeURIComponent\(assetId\)\}\/remove-background/,
  );
  assert.match(backgroundSource, /proxyBackendRequest/);
});
