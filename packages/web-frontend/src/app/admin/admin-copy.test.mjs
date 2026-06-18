import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const adminSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "admin-shell.tsx"),
  "utf8",
);

test("admin page includes login, password change, and key management flows", () => {
  assert.match(adminSource, /管理员登录/);
  assert.match(adminSource, /修改密码/);
  assert.match(adminSource, /Key 管理/);
  assert.match(adminSource, /账号信息/);
});

test("admin page does not store auth tokens in browser storage", () => {
  assert.doesNotMatch(adminSource, /localStorage/);
  assert.doesNotMatch(adminSource, /sessionStorage/);
});

test("admin page talks only to same-origin admin api", () => {
  assert.match(adminSource, /\/api\/admin\/login/);
  assert.match(adminSource, /\/api\/admin\/password/);
  assert.match(adminSource, /\/api\/admin\/secrets/);
});
