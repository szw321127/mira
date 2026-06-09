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

test("admin frontend splits app shell into sidebar page modules", () => {
  const app = readSource("App.tsx");
  const workspace = readSource("admin/AdminWorkspace.tsx");
  const expectedFiles = [
    "admin/AdminLoginScreen.tsx",
    "admin/AdminWorkspace.tsx",
    "admin/navigation.tsx",
    "admin/pages/AdminProfilePage.tsx",
    "admin/pages/MembersPage.tsx",
    "admin/pages/ModelConfigsPage.tsx",
    "admin/pages/OverviewPage.tsx",
    "admin/pages/ProjectsPage.tsx",
    "admin/pages/TasksPage.tsx",
  ];

  assert.ok(
    app.split("\n").length < 260,
    "App.tsx should only compose auth state, theme, and the workspace shell",
  );
  for (const file of expectedFiles) {
    assert.ok(readSource(file).length > 0, `${file} should exist`);
  }
  assert.match(workspace, /renderActivePage/);
  assert.match(workspace, /activeMenuTitles/);
});

test("admin frontend exposes an Ant Design project management shell", () => {
  const app = readSource("App.tsx");
  const workspace = readSource("admin/AdminWorkspace.tsx");
  const navigation = readSource("admin/navigation.tsx");
  const index = readFileSync(join(root, "..", "index.html"), "utf8");
  const source = `${app}\n${workspace}\n${navigation}`;

  assert.match(source, /antd/);
  assert.match(source, /Layout/);
  assert.match(source, /项目管理后台/);
  assert.match(source, /项目总览/);
  assert.match(source, /项目列表/);
  assert.match(source, /任务看板/);
  assert.match(source, /Drawer/);
  assert.match(index, /<title>后台项目管理系统 \| RedNote<\/title>/);
  assert.doesNotMatch(source, /<Title level=\{2\}>后台项目管理系统<\/Title>/);
});

test("admin frontend loads project management data through the backend API", () => {
  const api = readSource("api.ts");
  const workspace = readSource("admin/AdminWorkspace.tsx");
  const projectsPage = readSource("admin/pages/ProjectsPage.tsx");
  const source = `${workspace}\n${projectsPage}`;

  assert.match(api, /VITE_BACKEND_URL/);
  assert.match(api, /ApiEnvelope/);
  assert.match(api, /AdminDashboard/);
  assert.match(api, /\/admin\/projects\/dashboard/);
  assert.match(api, /CreateAdminProjectInput/);
  assert.match(api, /createAdminProject/);
  assert.match(api, /\/admin\/projects/);
  assert.match(source, /loadProjectManagementDashboard/);
  assert.match(source, /handleCreateProject/);
  assert.match(source, /项目名称/);
  assert.match(source, /创建项目/);
  assert.match(source, /dashboardState/);
  assert.match(source, /\[projects, searchQuery, statusFilter\]/);
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
  const login = readSource("admin/AdminLoginScreen.tsx");
  const workspace = readSource("admin/AdminWorkspace.tsx");
  const profile = readSource("admin/pages/AdminProfilePage.tsx");
  const css = readSource("styles.css");
  const source = `${app}\n${login}\n${workspace}\n${profile}`;

  assert.match(source, /管理员登录/);
  assert.match(source, /initialAdminSession/);
  assert.match(source, /handleAdminLogin/);
  assert.match(source, /管理员信息/);
  assert.match(source, /修改密码/);
  assert.match(source, /当前密码/);
  assert.match(source, /新密码/);
  assert.match(source, /退出登录/);
  assert.match(source, /UserOutlined/);
  assert.match(css, /admin-login-shell/);
  assert.match(css, /admin-profile-grid/);
});

test("admin frontend manages text and image model configs without exposing api keys", () => {
  const api = readSource("api.ts");
  const settings = `${readSource("admin/adminTypes.ts")}\n${readSource(
    "admin/pages/ModelConfigsPage.tsx",
  )}`;
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
  assert.match(settings, /模型配置/);
  assert.match(settings, /文本模型/);
  assert.match(settings, /图片模型/);
  assert.match(settings, /baseUrl/);
  assert.match(settings, /apiKeys/);
  assert.match(settings, /新增 API Key/);
  assert.match(settings, /Switch/);
  assert.match(settings, /Popconfirm/);
  assert.match(css, /model-config-grid/);
  assert.match(css, /api-key-list/);
});

test("admin sidebar can collapse to icon-only navigation", () => {
  const workspace = readSource("admin/AdminWorkspace.tsx");
  const css = readSource("styles.css");

  assert.match(workspace, /siderCollapsed/);
  assert.match(workspace, /collapsible/);
  assert.match(workspace, /collapsed=\{siderCollapsed\}/);
  assert.match(workspace, /trigger=\{null\}/);
  assert.match(workspace, /desktop-sider-toggle/);
  assert.match(workspace, /inlineCollapsed=\{siderCollapsed\}/);
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
  const workspace = readSource("admin/AdminWorkspace.tsx");
  const projectsPage = readSource("admin/pages/ProjectsPage.tsx");
  const tasksPage = readSource("admin/pages/TasksPage.tsx");
  const source = `${workspace}\n${projectsPage}\n${tasksPage}`;

  assert.match(source, /searchQuery/);
  assert.match(source, /filteredTasks/);
  assert.match(source, /没有匹配的项目/);
  assert.match(source, /没有匹配的任务/);
});

test("primary header actions expose operator feedback instead of silent buttons", () => {
  const workspace = readSource("admin/AdminWorkspace.tsx");

  assert.match(workspace, /noticeOpen/);
  assert.match(workspace, /createProjectOpen/);
  assert.match(workspace, /exportStatus/);
  assert.match(workspace, /已导出当前筛选结果/);
  assert.match(workspace, /暂无新通知/);
  assert.doesNotMatch(workspace, /等待权限接口接入后开放/);
  assert.doesNotMatch(workspace, /新建项目需要后端接口/);
});

test("mobile admin layout has navigation and horizontal overflow controls", () => {
  const workspace = readSource("admin/AdminWorkspace.tsx");
  const css = readSource("styles.css");

  assert.match(workspace, /mobile-nav-button/);
  assert.match(workspace, /mobile-nav-drawer/);
  assert.match(css, /table-scroll/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /max-width:\s*100%/);
});

test("admin shell avoids deprecated Ant Design props", () => {
  const source = [
    "App.tsx",
    "admin/AdminLoginScreen.tsx",
    "admin/AdminWorkspace.tsx",
    "admin/pages/AdminProfilePage.tsx",
    "admin/pages/ModelConfigsPage.tsx",
    "admin/pages/OverviewPage.tsx",
    "admin/pages/ProjectsPage.tsx",
  ]
    .map(readSource)
    .join("\n");
  const alertBlocks = source.match(/<Alert\b[\s\S]*?\/>/g) ?? [];

  assert.doesNotMatch(source, /valueStyle=/);
  assert.doesNotMatch(source, /<Drawer[\s\S]*width=/);
  for (const alertBlock of alertBlocks) {
    assert.doesNotMatch(alertBlock, /message=/);
    assert.doesNotMatch(alertBlock, /onClose=/);
  }
  assert.match(source, /styles=\{\{\s*content:/);
  assert.match(source, /size="large"/);
  assert.match(source, /title="模型配置接口加载失败"/);
});

test("risk projects are promoted into an actionable queue", () => {
  const overview = readSource("admin/pages/OverviewPage.tsx");
  const css = readSource("styles.css");

  assert.match(overview, /riskQueueProjects/);
  assert.match(overview, /riskReason/);
  assert.match(overview, /风险处理队列/);
  assert.match(overview, /严重度/);
  assert.match(overview, /最近更新/);
  assert.match(overview, /下一步动作/);
  assert.match(overview, /升级负责人/);
  assert.match(css, /risk-queue/);
});
