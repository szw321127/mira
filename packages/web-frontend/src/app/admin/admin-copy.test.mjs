import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const adminDir = dirname(fileURLToPath(import.meta.url));

function readAdminFile(fileName) {
  const filePath = join(adminDir, fileName);
  assert.equal(existsSync(filePath), true, `${fileName} should exist`);
  return readFileSync(filePath, "utf8");
}

const adminSource = readAdminFile("admin-shell.tsx");

test("admin page includes login, password change, and key management flows", () => {
  assert.match(adminSource, /账号信息/);
  assert.match(readAdminFile("admin-login-panel.tsx"), /管理员登录/);
  assert.match(readAdminFile("admin-password-panel.tsx"), /修改密码/);
  assert.match(readAdminFile("admin-secrets-panel.tsx"), /Key 管理/);
});

test("admin page does not store auth tokens in browser storage", () => {
  assert.doesNotMatch(adminSource, /localStorage/);
  assert.doesNotMatch(adminSource, /sessionStorage/);
});

test("admin page talks only to same-origin admin api", () => {
  const apiSource = readAdminFile("admin-api.ts");

  assert.match(apiSource, /\/api\/admin\/login/);
  assert.match(apiSource, /\/api\/admin\/password/);
  assert.match(apiSource, /\/api\/admin\/secrets/);
  assert.match(apiSource, /\/api\/admin\/users/);
  assert.match(apiSource, /\/status/);
});

test("admin shell is split into focused panels", () => {
  assert.match(adminSource, /AdminLoginPanel/);
  assert.match(adminSource, /AdminPasswordPanel/);
  assert.match(adminSource, /AdminSecretsPanel/);
  assert.match(adminSource, /AdminUsersPanel/);
});

test("admin users panel manages account search filters and status actions", () => {
  const usersPanelSource = readAdminFile("admin-users-panel.tsx");

  assert.match(usersPanelSource, /账号管理/);
  assert.match(usersPanelSource, /搜索邮箱/);
  assert.match(usersPanelSource, /全部账号/);
  assert.match(usersPanelSource, /启用账号/);
  assert.match(usersPanelSource, /禁用账号/);
  assert.match(usersPanelSource, /loadAdminUsers/);
  assert.match(usersPanelSource, /updateAdminUserStatus/);
  assert.match(usersPanelSource, /conversationCount/);
});

test("admin inputs avoid outline styling and keep placeholders readable", () => {
  const uiSources = [
    readAdminFile("admin-login-panel.tsx"),
    readAdminFile("admin-password-panel.tsx"),
    readAdminFile("admin-secrets-panel.tsx"),
    readAdminFile("admin-users-panel.tsx"),
  ].join("\n");

  const outlineClasses = uiSources.match(/(?:focus:|focus-visible:)?outline-[^\s"']+/g) ?? [];
  assert.ok(
    outlineClasses.every((className) => className.endsWith("outline-none")),
    `unexpected outline classes: ${outlineClasses.join(", ")}`,
  );
  const noOutlineInputs = uiSources.match(/focus:outline-none/g) ?? [];
  const readablePlaceholders =
    uiSources.match(/placeholder:text-\[var\(--muted-strong\)\]/g) ?? [];
  assert.ok(noOutlineInputs.length >= 4, "admin inputs should disable outline");
  assert.ok(
    readablePlaceholders.length >= 4,
    "admin placeholders should use readable contrast",
  );
});

test("admin UI avoids border plus large soft shadow ghost cards", () => {
  const uiSources = [
    adminSource,
    readAdminFile("admin-login-panel.tsx"),
    readAdminFile("admin-password-panel.tsx"),
    readAdminFile("admin-secrets-panel.tsx"),
    readAdminFile("admin-users-panel.tsx"),
  ].join("\n");

  assert.doesNotMatch(uiSources, /shadow-\[0_18px_48px/);
});
