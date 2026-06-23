import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const routeSource = readFileSync(
  join(apiDir, "admin", "proxy.ts"),
  "utf8",
);
const sharedProxySource = readFileSync(
  join(apiDir, "shared", "backend-proxy.ts"),
  "utf8",
);
const imageUsageRouteSource = readFileSync(
  join(apiDir, "admin", "image-usage", "route.ts"),
  "utf8",
);
const imageProviderTestRouteSource = readFileSync(
  join(apiDir, "admin", "image-provider", "test", "route.ts"),
  "utf8",
);

test("admin proxy targets backend admin routes", () => {
  assert.match(routeSource, /proxyBackendRequest/);
  assert.match(routeSource, /`admin\/\$\{adminPath\}`/);
  assert.match(imageUsageRouteSource, /proxyAdminRequest\(request, "image-usage"\)/);
  assert.match(
    imageProviderTestRouteSource,
    /proxyAdminRequest\(request, "image-provider\/test"\)/,
  );
});

test("shared backend proxy forwards cookies and preserves backend response headers", () => {
  assert.match(sharedProxySource, /request\.headers\.get\("cookie"\)/);
  assert.match(sharedProxySource, /set-cookie/);
  assert.match(sharedProxySource, /cache-control/);
  assert.match(sharedProxySource, /content-type/);
});

test("admin proxy does not import backend admin code into the frontend", () => {
  assert.doesNotMatch(routeSource, /@rednote\/backend/);
  assert.doesNotMatch(routeSource, /AdminService/);
});
