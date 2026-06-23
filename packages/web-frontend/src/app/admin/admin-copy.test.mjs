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
  assert.match(readAdminFile("admin-overview-panel.tsx"), /当前管理员/);
  assert.match(readAdminFile("admin-login-panel.tsx"), /管理员登录/);
  assert.match(readAdminFile("admin-password-panel.tsx"), /修改密码/);
  assert.match(readAdminFile("admin-secrets-panel.tsx"), /Key 管理/);
  assert.match(readAdminFile("admin-image-usage-panel.tsx"), /图像用量/);
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
  assert.match(apiSource, /\/api\/admin\/image-usage/);
  assert.match(apiSource, /\/api\/admin\/image-provider\/test/);
  assert.match(apiSource, /\/status/);
});

test("admin shell is split into focused panels", () => {
  assert.match(adminSource, /AdminLoginPanel/);
  assert.match(adminSource, /AdminNavigation/);
  assert.match(adminSource, /AdminOverviewPanel/);
  assert.match(adminSource, /AdminSecurityPanel/);
  assert.match(adminSource, /AdminSecretsPanel/);
  assert.match(adminSource, /AdminUsersPanel/);
  assert.match(adminSource, /AdminImageUsagePanel/);
  assert.match(readAdminFile("admin-security-panel.tsx"), /AdminPasswordPanel/);
});

test("admin shell separates modules behind sidebar navigation", () => {
  const navigationSource = readAdminFile("admin-navigation.tsx");
  const overviewSource = readAdminFile("admin-overview-panel.tsx");
  const frameSource = readAdminFile("admin-section-frame.tsx");
  const securitySource = readAdminFile("admin-security-panel.tsx");

  assert.match(adminSource, /AdminNavigation/);
  assert.match(adminSource, /activeSection/);
  assert.match(adminSource, /renderActiveSection/);
  assert.match(navigationSource, /总览/);
  assert.match(navigationSource, /账号管理/);
  assert.match(navigationSource, /图像用量/);
  assert.match(navigationSource, /Key 管理/);
  assert.match(navigationSource, /安全设置/);
  assert.match(navigationSource, /aria-current/);
  assert.match(navigationSource, /lg:hidden/);
  assert.match(navigationSource, /lg:flex/);
  assert.match(overviewSource, /onSelectSection/);
  assert.match(overviewSource, /打开图像用量/);
  assert.match(frameSource, /AdminSectionFrame/);
  assert.match(securitySource, /AdminPasswordPanel/);
});

test("admin shell initializes the active module from the URL hash", () => {
  assert.match(adminSource, /getInitialAdminSection/);
  assert.match(adminSource, /readSectionFromHash/);
  assert.match(adminSource, /window\.location\.hash/);
  assert.match(adminSource, /useState<AdminSection>\(getInitialAdminSection\)/);
});

test("admin image usage panel renders compact usage and cost reporting", () => {
  const usagePanelSource = readAdminFile("admin-image-usage-panel.tsx");

  assert.match(usagePanelSource, /图像用量/);
  assert.match(usagePanelSource, /loadAdminImageUsage/);
  assert.match(usagePanelSource, /estimatedCostUsd/);
  assert.match(usagePanelSource, /byProvider/);
  assert.match(usagePanelSource, /byType/);
  assert.match(usagePanelSource, /h-11/);
  assert.match(usagePanelSource, /md:h-9/);
});

test("admin key management can test image provider configuration", () => {
  const apiSource = readAdminFile("admin-api.ts");
  const typesSource = readAdminFile("admin-types.ts");
  const secretsPanelSource = readAdminFile("admin-secrets-panel.tsx");

  assert.match(typesSource, /AdminImageProviderTestResponse/);
  assert.match(apiSource, /testAdminImageProvider/);
  assert.match(apiSource, /\/api\/admin\/image-provider\/test/);
  assert.match(secretsPanelSource, /测试图像 Provider/);
  assert.match(secretsPanelSource, /testAdminImageProvider/);
  assert.match(secretsPanelSource, /h-11/);
  assert.match(secretsPanelSource, /md:h-9/);
});

test("admin users panel manages account search filters and status actions", () => {
  const usersPanelSource = readAdminFile("admin-users-panel.tsx");
  const typesSource = readAdminFile("admin-types.ts");

  assert.match(usersPanelSource, /账号管理/);
  assert.match(usersPanelSource, /搜索账号或邮箱/);
  assert.match(usersPanelSource, /账号名/);
  assert.match(usersPanelSource, /邮箱绑定/);
  assert.match(usersPanelSource, /登录方式/);
  assert.match(usersPanelSource, /renderAuthMethods/);
  assert.match(typesSource, /username:\s*string\s*\|\s*null/);
  assert.match(typesSource, /email:\s*string\s*\|\s*null/);
  assert.match(typesSource, /authMethods:\s*string\[\]/);
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
    readAdminFile("admin-image-usage-panel.tsx"),
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

test("admin module controls keep mobile touch targets", () => {
  const navigationSource = readAdminFile("admin-navigation.tsx");
  const loginPanelSource = readAdminFile("admin-login-panel.tsx");
  const passwordPanelSource = readAdminFile("admin-password-panel.tsx");
  const secretsPanelSource = readAdminFile("admin-secrets-panel.tsx");
  const usersPanelSource = readAdminFile("admin-users-panel.tsx");
  const usagePanelSource = readAdminFile("admin-image-usage-panel.tsx");

  assert.match(navigationSource, /inline-flex h-11 w-11/);
  assert.match(loginPanelSource, /h-11/);
  assert.match(loginPanelSource, /md:h-10/);
  assert.match(passwordPanelSource, /h-11/);
  assert.match(passwordPanelSource, /md:h-9/);
  assert.match(secretsPanelSource, /h-11/);
  assert.match(secretsPanelSource, /md:h-9/);
  assert.match(usersPanelSource, /h-11/);
  assert.match(usersPanelSource, /md:h-9/);
  assert.match(usagePanelSource, /h-11/);
  assert.match(usagePanelSource, /md:h-9/);
});

test("admin sidebar navigation constrains long labels inside the rail", () => {
  const navigationSource = readAdminFile("admin-navigation.tsx");

  assert.match(navigationSource, /grid-cols-\[minmax\(0,1fr\)\]/);
  assert.match(navigationSource, /min-h-11 min-w-0 w-full/);
});

test("admin UI avoids border plus large soft shadow ghost cards", () => {
  const uiSources = [
    adminSource,
    readAdminFile("admin-navigation.tsx"),
    readAdminFile("admin-overview-panel.tsx"),
    readAdminFile("admin-section-frame.tsx"),
    readAdminFile("admin-security-panel.tsx"),
    readAdminFile("admin-login-panel.tsx"),
    readAdminFile("admin-password-panel.tsx"),
    readAdminFile("admin-secrets-panel.tsx"),
    readAdminFile("admin-users-panel.tsx"),
    readAdminFile("admin-image-usage-panel.tsx"),
  ].join("\n");

  assert.doesNotMatch(uiSources, /shadow-\[0_18px_48px/);
});
