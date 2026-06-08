import {
  Alert,
  App as AntdApp,
  Avatar,
  Badge,
  Button,
  Card,
  ConfigProvider,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Input,
  Layout,
  Menu,
  Modal,
  Progress,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Timeline,
  Typography,
  theme,
} from "antd";
import type { MenuProps, TableProps } from "antd";
import {
  BellOutlined,
  CheckCircleOutlined,
  DashboardOutlined,
  ExportOutlined,
  MenuOutlined,
  PlusOutlined,
  ProjectOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import {
  getApiErrorMessage,
  loadProjectManagementDashboard,
  type AdminDashboard,
  type AdminProject as Project,
  type AdminProjectStatus as ProjectStatus,
  type AdminTask as Task,
} from "./api";

const { Content, Header, Sider } = Layout;
const { Text, Title } = Typography;

type NavigationKey = "overview" | "projects" | "tasks" | "members" | "settings";
type ExportStatus = "idle" | "done";

const statusColor: Record<ProjectStatus, string> = {
  已上线: "green",
  规划中: "blue",
  进行中: "processing",
  风险: "error",
};

const taskColor = {
  已完成: "success",
  待开始: "default",
  推进中: "processing",
  验收中: "warning",
} as const satisfies Record<
  Task["status"],
  "default" | "error" | "processing" | "success" | "warning"
>;

const menuItems: MenuProps["items"] = [
  { icon: <DashboardOutlined />, key: "overview", label: "项目总览" },
  { icon: <ProjectOutlined />, key: "projects", label: "项目列表" },
  { icon: <CheckCircleOutlined />, key: "tasks", label: "任务看板" },
  { icon: <TeamOutlined />, key: "members", label: "成员管理" },
  { icon: <SettingOutlined />, key: "settings", label: "系统设置" },
];

function matchesQuery(values: Array<string | number>, query: string) {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  return values
    .map((value) => String(value).toLocaleLowerCase())
    .some((value) => value.includes(normalizedQuery));
}

function buildProjectCsv(rows: Project[]) {
  const headers = ["项目名称", "负责人", "状态", "优先级", "进度", "截止"];
  const body = rows.map((project) =>
    [
      project.name,
      project.owner,
      project.status,
      project.priority,
      `${project.progress}%`,
      project.dueDate,
    ]
      .map((value) => `"${value.replaceAll('"', '""')}"`)
      .join(","),
  );

  return [headers.join(","), ...body].join("\n");
}

const emptyDashboard: AdminDashboard = {
  capabilities: {
    canCreateProject: false,
  },
  metrics: {
    activeProjects: 0,
    averageProgress: 0,
    riskProjects: 0,
    totalProjects: 0,
    weeklyCompletedTasks: 0,
  },
  notifications: [],
  projects: [],
  riskQueue: [],
  tasks: [],
};

type DashboardState = {
  data: AdminDashboard;
  errorMessage: string | null;
  status: "error" | "loading" | "ready";
};

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          borderRadius: 6,
          colorBgLayout: "#f6f7f9",
          colorPrimary: "#b20d2a",
          colorText: "#1f2328",
          fontFamily:
            '"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
      }}
    >
      <AntdApp>
        <AdminWorkspace />
      </AntdApp>
    </ConfigProvider>
  );
}

function AdminWorkspace() {
  const [activeMenu, setActiveMenu] = useState<NavigationKey>("overview");
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [dashboardState, setDashboardState] = useState<DashboardState>({
    data: emptyDashboard,
    errorMessage: null,
    status: "loading",
  });
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "全部">("全部");

  useEffect(() => {
    let active = true;

    loadProjectManagementDashboard()
      .then((data) => {
        if (!active) {
          return;
        }

        setDashboardState({
          data,
          errorMessage: null,
          status: "ready",
        });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setDashboardState({
          data: emptyDashboard,
          errorMessage: getApiErrorMessage(error),
          status: "error",
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const {
    capabilities,
    metrics,
    notifications,
    projects,
    riskQueue,
    tasks,
  } = dashboardState.data;
  const dashboardLoading = dashboardState.status === "loading";

  const filteredProjects = useMemo(
    () =>
      projects.filter((project) => {
        const statusMatched =
          statusFilter === "全部" || project.status === statusFilter;
        const searchMatched = matchesQuery(
          [
            project.name,
            project.owner,
            project.status,
            project.priority,
            project.budget,
            project.dueDate,
            ...project.team,
          ],
          searchQuery,
        );

        return statusMatched && searchMatched;
      }),
    [projects, searchQuery, statusFilter],
  );

  const filteredTasks = useMemo(() => {
    const statusProjectNames = new Set(
      projects
        .filter(
          (project) =>
            statusFilter === "全部" || project.status === statusFilter,
        )
        .map((project) => project.name),
    );

    return tasks.filter((task) => {
      const statusMatched =
        statusFilter === "全部" || statusProjectNames.has(task.project);
      const searchMatched = matchesQuery(
        [task.name, task.project, task.assignee, task.status, task.dueDate],
        searchQuery,
      );

      return statusMatched && searchMatched;
    });
  }, [projects, searchQuery, statusFilter, tasks]);

  const riskQueueProjects = useMemo(
    () =>
      riskQueue.filter(
        (project) =>
          project.status === "风险" &&
          matchesQuery(
            [
              project.name,
              project.owner,
              project.riskReason ?? "",
              project.riskLatestUpdate ?? "",
              project.riskNextAction ?? "",
              project.riskEscalationOwner ?? "",
            ],
            searchQuery,
          ),
      ),
    [riskQueue, searchQuery],
  );

  const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
    const nextKey = key as NavigationKey;
    setActiveMenu(nextKey);
    setMobileNavOpen(false);

    if (nextKey === "projects" || nextKey === "tasks") {
      document
        .getElementById(nextKey === "projects" ? "project-list" : "task-board")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      setOperationNotice(
        nextKey === "projects" ? "已跳转到项目列表" : "已跳转到任务看板",
      );
      return;
    }

    if (nextKey === "overview") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setOperationNotice("已回到项目总览");
      return;
    }

    setOperationNotice(
      nextKey === "members"
        ? "成员管理入口已记录，等待权限接口接入后开放"
        : "系统设置入口已记录，等待后台配置接口接入后开放",
    );
  };

  const handleExport = () => {
    const csv = buildProjectCsv(filteredProjects);
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "rednote-projects.csv";
    link.click();
    URL.revokeObjectURL(url);

    setExportStatus("done");
    setOperationNotice("已导出当前筛选结果");
  };

  const projectColumns: TableProps<Project>["columns"] = [
    {
      dataIndex: "name",
      key: "name",
      title: "项目名称",
      render: (_, project) => (
        <Button
          className="project-link"
          onClick={() => setSelectedProject(project)}
          type="link"
        >
          {project.name}
        </Button>
      ),
    },
    {
      dataIndex: "owner",
      key: "owner",
      title: "负责人",
    },
    {
      dataIndex: "status",
      key: "status",
      title: "状态",
      render: (status: ProjectStatus) => (
        <Tag color={statusColor[status]}>{status}</Tag>
      ),
    },
    {
      dataIndex: "priority",
      key: "priority",
      title: "优先级",
      render: (priority: Project["priority"]) => <Tag>{priority}</Tag>,
    },
    {
      dataIndex: "progress",
      key: "progress",
      title: "进度",
      render: (progress: number) => (
        <Progress percent={progress} size="small" />
      ),
    },
    {
      dataIndex: "dueDate",
      key: "dueDate",
      title: "截止",
    },
  ];

  const taskColumns: TableProps<Task>["columns"] = [
    { dataIndex: "name", key: "name", title: "任务" },
    { dataIndex: "project", key: "project", title: "所属项目" },
    { dataIndex: "assignee", key: "assignee", title: "负责人" },
    {
      dataIndex: "status",
      key: "status",
      title: "状态",
      render: (status: Task["status"]) => (
        <Badge status={taskColor[status]} text={status} />
      ),
    },
    { dataIndex: "dueDate", key: "dueDate", title: "截止" },
  ];

  const navigation = (
    <Menu
      items={menuItems}
      mode="inline"
      onClick={handleMenuClick}
      selectedKeys={[activeMenu]}
      theme="dark"
    />
  );

  return (
    <Layout className="admin-shell">
      <Sider className="admin-sider" width={232}>
        <div className="admin-brand">
          <span>R</span>
          <div>
            <strong>RedNote Admin</strong>
            <small>项目管理后台</small>
          </div>
        </div>
        {navigation}
      </Sider>

      <Layout className="admin-main-layout">
        <Header className="admin-header">
          <div className="admin-title-row">
            <Button
              aria-label="打开后台导航"
              className="mobile-nav-button"
              icon={<MenuOutlined />}
              onClick={() => setMobileNavOpen(true)}
            />
            <div>
              <Text className="section-kicker">项目总览</Text>
              <Title level={2}>后台项目管理系统</Title>
            </div>
          </div>
          <Space className="admin-header-actions" size={12} wrap>
            <Input
              allowClear
              className="admin-search"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索项目、任务、负责人"
              prefix={<SearchOutlined />}
              value={searchQuery}
            />
            <Button
              aria-label="查看通知"
              icon={<BellOutlined />}
              onClick={() => setNoticeOpen(true)}
            >
              通知
            </Button>
            <Button icon={<ExportOutlined />} onClick={handleExport}>
              {exportStatus === "done" ? "已导出" : "导出"}
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={() => setCreateProjectOpen(true)}
              type="primary"
            >
              新建项目
            </Button>
          </Space>
        </Header>

        <Content className="admin-content">
          {dashboardState.status === "error" ? (
            <Alert
              message="项目管理接口加载失败"
              description={dashboardState.errorMessage}
              showIcon
              type="error"
            />
          ) : null}

          {operationNotice ? (
            <Alert
              className="operation-alert"
              closable
              message={operationNotice}
              onClose={() => setOperationNotice(null)}
              showIcon
              type={exportStatus === "done" ? "success" : "info"}
            />
          ) : null}

          <div className="metric-grid">
            <Card>
              <Statistic
                title="进行中项目"
                value={metrics.activeProjects}
                suffix={`/ ${metrics.totalProjects}`}
              />
            </Card>
            <Card>
              <Statistic title="本周完成任务" value={metrics.weeklyCompletedTasks} />
            </Card>
            <Card>
              <Statistic
                styles={{ content: { color: "#b20d2a" } }}
                title="风险项目"
                value={metrics.riskProjects}
              />
            </Card>
            <Card>
              <Statistic title="平均进度" value={metrics.averageProgress} suffix="%" />
            </Card>
          </div>

          <Card
            className="admin-card risk-queue"
            title={
              <Flex align="center" gap={8} wrap>
                <span>风险处理队列</span>
                <Tag color="error">{riskQueueProjects.length} 项待处理</Tag>
              </Flex>
            }
          >
            {riskQueueProjects.length > 0 ? (
              <div className="risk-list">
                {riskQueueProjects.map((project) => (
                  <div className="risk-item" key={project.key}>
                    <div className="risk-item-main">
                      <Flex align="center" gap={8} wrap>
                        <Tag color="error">严重度：{project.riskSeverity}</Tag>
                        <Button
                          className="project-link"
                          onClick={() => setSelectedProject(project)}
                          type="link"
                        >
                          {project.name}
                        </Button>
                      </Flex>
                      <Text>{project.riskReason}</Text>
                    </div>
                    <div className="risk-meta-grid">
                      <div>
                        <Text type="secondary">最近更新</Text>
                        <strong>{project.riskLatestUpdate}</strong>
                      </div>
                      <div>
                        <Text type="secondary">下一步动作</Text>
                        <strong>{project.riskNextAction}</strong>
                      </div>
                      <div>
                        <Text type="secondary">升级负责人</Text>
                        <strong>{project.riskEscalationOwner}</strong>
                      </div>
                    </div>
                    <Button
                      onClick={() => setSelectedProject(project)}
                      size="small"
                      type="primary"
                    >
                      查看详情
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="当前没有匹配的风险项目" />
            )}
          </Card>

          <div className="admin-grid">
            <Card
              className="admin-card"
              extra={
                <div className="status-filter">
                  <Segmented
                    onChange={(value) =>
                      setStatusFilter(value as ProjectStatus | "全部")
                    }
                    options={["全部", "进行中", "风险", "规划中", "已上线"]}
                    value={statusFilter}
                  />
                </div>
              }
              id="project-list"
              title="项目列表"
            >
              <div className="table-scroll">
                <Table
                  columns={projectColumns}
                  dataSource={filteredProjects}
                  locale={{ emptyText: <Empty description="没有匹配的项目" /> }}
                  loading={dashboardLoading}
                  pagination={false}
                  rowKey="key"
                  size="middle"
                />
              </div>
            </Card>

            <Card className="admin-card" id="task-board" title="任务看板">
              <div className="table-scroll">
                <Table
                  columns={taskColumns}
                  dataSource={filteredTasks}
                  locale={{ emptyText: <Empty description="没有匹配的任务" /> }}
                  loading={dashboardLoading}
                  pagination={false}
                  rowKey="key"
                  size="middle"
                />
              </div>
            </Card>
          </div>
        </Content>
      </Layout>

      <Drawer
        className="mobile-nav-drawer"
        onClose={() => setMobileNavOpen(false)}
        open={mobileNavOpen}
        placement="left"
        size="large"
        title="后台导航"
      >
        {navigation}
      </Drawer>

      <Drawer
        onClose={() => setNoticeOpen(false)}
        open={noticeOpen}
        size="large"
        title="通知中心"
      >
        {notifications.length > 0 ? (
          <Timeline
            items={notifications.map((notification) => ({
              children: (
                <Space direction="vertical" size={2}>
                  <Text strong>{notification.title}</Text>
                  <Text>{notification.description}</Text>
                  <Text type="secondary">{notification.createdAt}</Text>
                </Space>
              ),
            }))}
          />
        ) : (
          <Empty description="暂无新通知" />
        )}
      </Drawer>

      <Modal
        cancelText="关闭"
        okButtonProps={{ disabled: !capabilities.canCreateProject }}
        okText={capabilities.canCreateProject ? "创建项目" : "等待接口"}
        onCancel={() => setCreateProjectOpen(false)}
        open={createProjectOpen}
        title="新建项目"
      >
        <Alert
          description={
            capabilities.canCreateProject
              ? "项目创建接口已开放，可以继续接入表单提交。"
              : "当前后端返回暂未开放创建权限，先保留入口状态。"
          }
          message={
            capabilities.canCreateProject
              ? "新建项目接口已开放"
              : "新建项目需要后端接口"
          }
          showIcon
          type="info"
        />
      </Modal>

      <Drawer
        onClose={() => setSelectedProject(null)}
        open={Boolean(selectedProject)}
        size="large"
        title="项目详情"
      >
        {selectedProject ? (
          <Space direction="vertical" size={18} style={{ width: "100%" }}>
            <Flex align="center" justify="space-between">
              <div>
                <Title level={4}>{selectedProject.name}</Title>
                <Text type="secondary">负责人：{selectedProject.owner}</Text>
              </div>
              <Tag color={statusColor[selectedProject.status]}>
                {selectedProject.status}
              </Tag>
            </Flex>

            <Progress percent={selectedProject.progress} />

            <Descriptions column={1} size="small">
              <Descriptions.Item label="预算">
                {selectedProject.budget}
              </Descriptions.Item>
              <Descriptions.Item label="截止日期">
                {selectedProject.dueDate}
              </Descriptions.Item>
              <Descriptions.Item label="任务完成">
                {selectedProject.taskDone}/{selectedProject.taskTotal}
              </Descriptions.Item>
              <Descriptions.Item label="优先级">
                {selectedProject.priority}
              </Descriptions.Item>
            </Descriptions>

            {selectedProject.status === "风险" ? (
              <div className="risk-detail-panel">
                <Alert
                  message="风险处置"
                  description={selectedProject.riskReason}
                  showIcon
                  type="error"
                />
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="严重度">
                    {selectedProject.riskSeverity}
                  </Descriptions.Item>
                  <Descriptions.Item label="最近更新">
                    {selectedProject.riskLatestUpdate}
                  </Descriptions.Item>
                  <Descriptions.Item label="下一步动作">
                    {selectedProject.riskNextAction}
                  </Descriptions.Item>
                  <Descriptions.Item label="升级负责人">
                    {selectedProject.riskEscalationOwner}
                  </Descriptions.Item>
                </Descriptions>
              </div>
            ) : null}

            <div>
              <Text strong>成员</Text>
              <Avatar.Group className="member-group">
                {selectedProject.team.map((member) => (
                  <Avatar key={member}>{member.slice(0, 1)}</Avatar>
                ))}
              </Avatar.Group>
            </div>

            <Timeline
              items={[
                { children: "完成后台信息架构梳理" },
                { children: "接入项目列表与任务看板" },
                { children: "补充权限和审计日志", color: "gray" },
              ]}
            />
          </Space>
        ) : null}
      </Drawer>
    </Layout>
  );
}
