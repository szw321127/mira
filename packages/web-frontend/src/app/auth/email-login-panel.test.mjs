import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const authDir = dirname(fileURLToPath(import.meta.url));

function readAuthFile(fileName) {
  const filePath = join(authDir, fileName);
  assert.equal(existsSync(filePath), true, `${fileName} should exist`);
  return readFileSync(filePath, "utf8");
}

test("auth api uses same-origin email code endpoints with backend fallback messages", () => {
  const apiSource = readAuthFile("auth-api.ts");

  assert.match(apiSource, /fetch\("\/api\/auth\/session"/);
  assert.match(apiSource, /fetch\("\/api\/auth\/code"/);
  assert.match(apiSource, /fetch\("\/api\/auth\/login"/);
  assert.match(apiSource, /fetch\("\/api\/auth\/logout"/);
  assert.match(apiSource, /验证码发送失败/);
  assert.match(apiSource, /登录失败/);
  assert.match(apiSource, /退出登录失败/);
  assert.match(
    apiSource,
    /logoutAuthSession[\s\S]*if \(!response\.ok\)[\s\S]*readBackendMessage/,
  );
  assert.match(apiSource, /response\.json\(\)\.catch/);
});

test("auth session hook exposes checking guest ready states and cookie logout", () => {
  const hookSource = readAuthFile("use-auth-session.ts");

  assert.match(hookSource, /"use client"/);
  assert.match(hookSource, /useState<AuthState>\(\{\s*status: "checking"\s*\}\)/s);
  assert.match(hookSource, /loadAuthSession\(\)/);
  assert.match(hookSource, /setUser/);
  assert.match(hookSource, /logoutAuthSession\(\)/);
  assert.match(hookSource, /status: "guest"/);
});

test("email login panel requests and submits one-time email codes", () => {
  const panelSource = readAuthFile("email-login-panel.tsx");

  assert.match(panelSource, /requestEmailCode/);
  assert.match(panelSource, /loginWithEmailCode/);
  assert.match(panelSource, /type="email"/);
  assert.match(panelSource, /autoComplete="email"/);
  assert.match(panelSource, /autoComplete="one-time-code"/);
  assert.match(panelSource, /inputMode="numeric"/);
  assert.match(panelSource, /maxLength=\{6\}/);
  assert.match(panelSource, /replace\(\/\\D\+\/g/);
  assert.match(panelSource, /Loader2/);
});

test("email login panel reads as product UI, not a hero landing page", () => {
  const panelSource = readAuthFile("email-login-panel.tsx");

  assert.match(panelSource, /\/brand\/mira-logo\.svg/);
  assert.match(panelSource, /继续进入 Mira/);
  assert.match(panelSource, /最近工作/);
  assert.match(panelSource, /账号工作区/);
  assert.match(panelSource, /rounded-\[8px\]|rounded-\[9px\]|rounded-\[10px\]/);
  assert.doesNotMatch(panelSource, /\bhero\b/i);
  assert.doesNotMatch(panelSource, /landing/i);
});

test("home page gates workspace behind auth session", () => {
  const pageSource = readFileSync(join(authDir, "../page.tsx"), "utf8");

  assert.match(pageSource, /useAuthSession/);
  assert.match(pageSource, /EmailLoginPanel/);
  assert.match(pageSource, /status === "checking"/);
  assert.match(pageSource, /status === "guest"/);
  assert.match(pageSource, /AgentWorkspaceShell/);
  assert.match(pageSource, /useAgentConversation\(\)/);
});
