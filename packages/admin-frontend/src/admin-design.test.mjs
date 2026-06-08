import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));

function readSource(name) {
  const file = join(root, name);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

test("admin frontend exposes an Ant Design project management shell", () => {
  const app = readSource("App.tsx");

  assert.match(app, /antd/);
  assert.match(app, /Layout/);
  assert.match(app, /项目管理后台/);
  assert.match(app, /项目总览/);
  assert.match(app, /项目列表/);
  assert.match(app, /任务看板/);
  assert.match(app, /Drawer/);
});

test("admin shell has real search state, filtered tasks, and empty states", () => {
  const app = readSource("App.tsx");

  assert.match(app, /searchQuery/);
  assert.match(app, /filteredTasks/);
  assert.match(app, /没有匹配的项目/);
  assert.match(app, /没有匹配的任务/);
});

test("primary header actions expose operator feedback instead of silent buttons", () => {
  const app = readSource("App.tsx");

  assert.match(app, /noticeOpen/);
  assert.match(app, /createProjectOpen/);
  assert.match(app, /exportStatus/);
  assert.match(app, /已导出当前筛选结果/);
  assert.match(app, /暂无新通知/);
});

test("mobile admin layout has navigation and horizontal overflow controls", () => {
  const app = readSource("App.tsx");
  const css = readSource("styles.css");

  assert.match(app, /mobile-nav-button/);
  assert.match(app, /mobile-nav-drawer/);
  assert.match(app, /table-scroll/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /max-width:\s*100%/);
});

test("admin shell avoids deprecated Ant Design props", () => {
  const app = readSource("App.tsx");

  assert.doesNotMatch(app, /valueStyle=/);
  assert.doesNotMatch(app, /<Drawer[\s\S]*width=/);
  assert.match(app, /styles=\{\{\s*content:/);
  assert.match(app, /size="large"/);
});

test("risk projects are promoted into an actionable queue", () => {
  const app = readSource("App.tsx");
  const css = readSource("styles.css");

  assert.match(app, /riskQueueProjects/);
  assert.match(app, /riskReason/);
  assert.match(app, /风险处理队列/);
  assert.match(app, /严重度/);
  assert.match(app, /最近更新/);
  assert.match(app, /下一步动作/);
  assert.match(app, /升级负责人/);
  assert.match(css, /risk-queue/);
});
