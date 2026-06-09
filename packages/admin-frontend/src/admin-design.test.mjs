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
  const index = readFileSync(join(root, "..", "index.html"), "utf8");

  assert.match(app, /antd/);
  assert.match(app, /Layout/);
  assert.match(app, /项目管理后台/);
  assert.match(app, /项目总览/);
  assert.match(app, /项目列表/);
  assert.match(app, /任务看板/);
  assert.match(app, /Drawer/);
  assert.match(index, /<title>后台项目管理系统 \| RedNote<\/title>/);
  assert.doesNotMatch(app, /<Title level=\{2\}>后台项目管理系统<\/Title>/);
});

test("admin frontend loads project management data through the backend API", () => {
  const api = readSource("api.ts");
  const app = readSource("App.tsx");

  assert.match(api, /VITE_BACKEND_URL/);
  assert.match(api, /ApiEnvelope/);
  assert.match(api, /AdminDashboard/);
  assert.match(api, /\/admin\/projects\/dashboard/);
  assert.match(api, /CreateAdminProjectInput/);
  assert.match(api, /createAdminProject/);
  assert.match(api, /\/admin\/projects/);
  assert.match(app, /loadProjectManagementDashboard/);
  assert.match(app, /handleCreateProject/);
  assert.match(app, /项目名称/);
  assert.match(app, /创建项目/);
  assert.match(app, /dashboardState/);
  assert.match(app, /\[projects, searchQuery, statusFilter\]/);
});

test("admin frontend API exposes task management mutations", () => {
  const api = readSource("api.ts");

  assert.match(api, /CreateAdminTaskInput/);
  assert.match(api, /UpdateAdminTaskInput/);
  assert.match(api, /createAdminTask/);
  assert.match(api, /updateAdminTask/);
  assert.match(api, /deleteAdminTask/);
  assert.match(api, /\/admin\/projects\/tasks/);
  assert.match(api, /\/admin\/projects\/tasks\/\$\{key\}/);
});

test("admin frontend API exposes audit log loading", () => {
  const api = readSource("api.ts");

  assert.match(api, /AdminAuditLog/);
  assert.match(api, /loadAdminAuditLogs/);
  assert.match(api, /\/admin\/audit-logs/);
});

test("admin frontend uses administrator bearer auth instead of exposed api keys", () => {
  const api = readSource("api.ts");

  assert.match(api, /AdminLoginResponse/);
  assert.match(api, /AdminProfile/);
  assert.match(api, /loginAdmin/);
  assert.match(api, /loadAdminProfile/);
  assert.match(api, /updateAdminProfile/);
  assert.match(api, /changeAdminPassword/);
  assert.match(api, /setAdminAccessToken/);
  assert.match(api, /Authorization/);
  assert.match(api, /Bearer/);
  assert.doesNotMatch(api, /VITE_ADMIN_API_KEY/);
  assert.doesNotMatch(api, /x-admin-api-key/);
});

test("admin frontend has login and administrator information management", () => {
  const app = readSource("App.tsx");
  const css = readSource("styles.css");

  assert.match(app, /管理员登录/);
  assert.match(app, /initialAdminSession/);
  assert.match(app, /handleAdminLogin/);
  assert.match(app, /管理员信息/);
  assert.match(app, /修改密码/);
  assert.match(app, /当前密码/);
  assert.match(app, /新密码/);
  assert.match(app, /退出登录/);
  assert.match(app, /UserOutlined/);
  assert.match(css, /admin-login-shell/);
  assert.match(css, /admin-profile-grid/);
});

test("admin frontend manages text and image model configs without exposing api keys", () => {
  const api = readSource("api.ts");
  const app = readSource("App.tsx");
  const css = readSource("styles.css");

  assert.match(api, /AdminModelConfig/);
  assert.match(api, /AdminModelApiKey/);
  assert.match(api, /loadModelConfigs/);
  assert.match(api, /saveModelConfig/);
  assert.match(api, /createModelApiKey/);
  assert.match(api, /updateModelApiKey/);
  assert.match(api, /deleteModelApiKey/);
  assert.match(api, /\/admin\/model-configs\/\$\{type\}\/api-keys/);
  assert.match(api, /testModelConfigConnection/);
  assert.match(api, /\/admin\/model-configs/);
  assert.match(api, /\/admin\/model-configs\/\$\{type\}\/test/);
  assert.match(app, /模型配置/);
  assert.match(app, /文本模型/);
  assert.match(app, /图片模型/);
  assert.match(app, /baseUrl/);
  assert.match(app, /apiKeys/);
  assert.match(app, /新增 API Key/);
  assert.match(app, /Switch/);
  assert.match(app, /Popconfirm/);
  assert.match(css, /model-config-grid/);
  assert.match(css, /api-key-list/);
});

test("admin sidebar can collapse to icon-only navigation", () => {
  const app = readSource("App.tsx");
  const css = readSource("styles.css");

  assert.match(app, /siderCollapsed/);
  assert.match(app, /collapsible/);
  assert.match(app, /collapsed=\{siderCollapsed\}/);
  assert.match(app, /trigger=\{null\}/);
  assert.match(app, /desktop-sider-toggle/);
  assert.match(app, /inlineCollapsed=\{siderCollapsed\}/);
  assert.match(css, /admin-brand-collapsed/);
});

test("admin desktop shell keeps header fixed and scrolls only main content", () => {
  const css = readSource("styles.css");

  assert.match(css, /\.admin-shell\s*\{[\s\S]*height:\s*100vh/);
  assert.match(css, /\.admin-main-layout\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.admin-header\s*\{[\s\S]*height:\s*64px/);
  assert.match(css, /\.admin-content\s*\{[\s\S]*overflow-y:\s*auto/);
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
  assert.doesNotMatch(app, /等待权限接口接入后开放/);
  assert.doesNotMatch(app, /新建项目需要后端接口/);
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
  const alertBlocks = app.match(/<Alert\b[\s\S]*?\/>/g) ?? [];

  assert.doesNotMatch(app, /valueStyle=/);
  assert.doesNotMatch(app, /<Drawer[\s\S]*width=/);
  for (const alertBlock of alertBlocks) {
    assert.doesNotMatch(alertBlock, /message=/);
    assert.doesNotMatch(alertBlock, /onClose=/);
  }
  assert.match(app, /styles=\{\{\s*content:/);
  assert.match(app, /size="large"/);
  assert.match(app, /title="模型配置接口加载失败"/);
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
