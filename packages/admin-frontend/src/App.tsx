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
import { useMemo, useState } from "react";

const { Content, Header, Sider } = Layout;
const { Text, Title } = Typography;

type ProjectStatus = "进行中" | "规划中" | "风险" | "已上线";
type NavigationKey = "overview" | "projects" | "tasks" | "members" | "settings";
type ExportStatus = "idle" | "done";

type Project = {
  budget: string;
  dueDate: string;
  key: string;
  name: string;
  owner: string;
  priority: "P0" | "P1" | "P2";
  progress: number;
  riskEscalationOwner?: string;
  riskLatestUpdate?: string;
  riskNextAction?: string;
  riskReason?: string;
  riskSeverity?: "高" | "中" | "低";
  status: ProjectStatus;
  taskDone: number;
  taskTotal: number;
  team: string[];
};

type Task = {
  assignee: string;
  dueDate: string;
  key: string;
  name: string;
  project: string;
  status: "待开始" | "推进中" | "验收中" | "已完成";
};

const projects: Project[] = [
  {
    budget: "18.4w",
    dueDate: "06/28",
    key: "rednote-admin",
    name: "RedNote 后台项目管理系统",
    owner: "林舟",
    priority: "P0",
    progress: 68,
    status: "进行中",
    taskDone: 21,
    taskTotal: 31,
    team: ["林舟", "阿遥", "Mia"],
  },
  {
    budget: "9.6w",
    dueDate: "07/05",
    key: "creator-workbench",
    name: "创作工作台体验优化",
    owner: "阿遥",
    priority: "P1",
    progress: 82,
    status: "进行中",
    taskDone: 36,
    taskTotal: 44,
    team: ["阿遥", "Kevin"],
  },
  {
    budget: "12.8w",
    dueDate: "07/18",
    key: "asset-pipeline",
    name: "封面资产生成链路",
    owner: "Mia",
    priority: "P1",
    progress: 46,
    riskEscalationOwner: "林舟",
    riskLatestUpdate: "今天 14:20 Mia 标记重试失败率上升",
    riskNextAction: "今晚前补齐失败重试与告警阈值",
    riskReason: "封面生成失败后的重试链路未闭环，可能影响 07/18 联调",
    riskSeverity: "高",
    status: "风险",
    taskDone: 14,
    taskTotal: 30,
    team: ["Mia", "林舟", "Eli"],
  },
  {
    budget: "6.1w",
    dueDate: "08/02",
    key: "ops-insight",
    name: "运营数据看板",
    owner: "Kevin",
    priority: "P2",
    progress: 24,
    status: "规划中",
    taskDone: 5,
    taskTotal: 21,
    team: ["Kevin", "Eli"],
  },
];

const tasks: Task[] = [
  {
    assignee: "林舟",
    dueDate: "今天",
    key: "t-1",
    name: "定义后台项目详情抽屉信息结构",
    project: "RedNote 后台项目管理系统",
    status: "推进中",
  },
  {
    assignee: "阿遥",
    dueDate: "明天",
    key: "t-2",
    name: "压缩工作台想法和大纲垂直间距",
    project: "创作工作台体验优化",
    status: "验收中",
  },
  {
    assignee: "Mia",
    dueDate: "06/12",
    key: "t-3",
    name: "补齐封面生成失败后的重试状态",
    project: "封面资产生成链路",
    status: "待开始",
  },
  {
    assignee: "Kevin",
    dueDate: "06/18",
    key: "t-4",
    name: "整理运营指标口径",
    project: "运营数据看板",
    status: "已完成",
  },
];

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
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "全部">("全部");

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
    [searchQuery, statusFilter],
  );

  const filteredTasks = useMemo(() => {
    const visibleProjectNames = new Set(filteredProjects.map((project) => project.name));

    return tasks.filter((task) => {
      const statusMatched =
        statusFilter === "全部" || visibleProjectNames.has(task.project);
      const searchMatched = matchesQuery(
        [task.name, task.project, task.assignee, task.status, task.dueDate],
        searchQuery,
      );

      return statusMatched && searchMatched;
    });
  }, [filteredProjects, searchQuery, statusFilter]);

  const riskQueueProjects = useMemo(
    () =>
      projects.filter(
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
    [searchQuery],
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
              <Statistic title="进行中项目" value={3} suffix="/ 4" />
            </Card>
            <Card>
              <Statistic title="本周完成任务" value={42} />
            </Card>
            <Card>
              <Statistic
                styles={{ content: { color: "#b20d2a" } }}
                title="风险项目"
                value={1}
              />
            </Card>
            <Card>
              <Statistic title="平均进度" value={55} suffix="%" />
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
        <Empty description="暂无新通知" />
      </Drawer>

      <Modal
        cancelText="关闭"
        okButtonProps={{ disabled: true }}
        okText="等待接口"
        onCancel={() => setCreateProjectOpen(false)}
        open={createProjectOpen}
        title="新建项目"
      >
        <Alert
          description="当前先保留入口状态，接入后端项目接口后会开放提交。"
          message="新建项目需要后端接口"
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
