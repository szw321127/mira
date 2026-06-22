import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "backend-proxy.ts",
);

async function loadProxyModule() {
  const source = readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

function mockFetch(implementation) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return implementation(...args);
  };

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test("backend proxy forwards request metadata and preserves response headers", async () => {
  const { proxyBackendRequest } = await loadProxyModule();
  const fetchMock = mockFetch(async () => {
    const headers = new Headers({
      "content-type": "application/json",
      "cache-control": "no-cache",
    });
    headers.append("set-cookie", "mira_user_session=one; Path=/; HttpOnly");
    headers.append(
      "set-cookie",
      "prefs=two; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/",
    );
    return new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers,
    });
  });

  try {
    const request = new Request("http://mira.local/api/auth/login?next=chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "existing=session",
      },
      body: JSON.stringify({ email: "a@example.com" }),
    });

    const response = await proxyBackendRequest(request, "auth/login");
    const [, init] = fetchMock.calls[0];

    assert.equal(
      fetchMock.calls[0][0],
      "http://localhost:3001/auth/login?next=chat",
    );
    assert.equal(init.method, "POST");
    assert.equal(init.headers.get("Content-Type"), "application/json");
    assert.equal(init.headers.get("Cookie"), "existing=session");
    assert.equal(init.body, JSON.stringify({ email: "a@example.com" }));
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("content-type"), "application/json");
    assert.equal(response.headers.get("cache-control"), "no-cache");
    assert.deepEqual(response.headers.getSetCookie(), [
      "mira_user_session=one; Path=/; HttpOnly",
      "prefs=two; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/",
    ]);
  } finally {
    fetchMock.restore();
  }
});

test("backend proxy omits GET bodies and preserves backend error responses", async () => {
  const { proxyBackendRequest } = await loadProxyModule();
  const fetchMock = mockFetch(async () => {
    return Response.json({ message: "User session required." }, { status: 401 });
  });

  try {
    const request = new Request("http://mira.local/api/auth/session", {
      method: "GET",
    });

    const response = await proxyBackendRequest(request, "auth/session");
    const [, init] = fetchMock.calls[0];

    assert.equal(init.method, "GET");
    assert.equal(init.body, undefined);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      message: "User session required.",
    });
  } finally {
    fetchMock.restore();
  }
});

test("backend proxy returns a 503 only for network failures", async () => {
  const { proxyBackendRequest } = await loadProxyModule();
  const fetchMock = mockFetch(async () => {
    throw new Error("connect ECONNREFUSED");
  });

  try {
    const request = new Request("http://mira.local/api/auth/session", {
      method: "GET",
    });

    const response = await proxyBackendRequest(request, "auth/session");

    assert.equal(response.status, 503);
    assert.match((await response.json()).message, /无法连接 Mira 后端服务/);
  } finally {
    fetchMock.restore();
  }
});
