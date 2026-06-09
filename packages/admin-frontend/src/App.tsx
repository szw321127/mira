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
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Popconfirm,
  Progress,
  Segmented,
  Select,
  Space,
  Statistic,
  Switch,
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
  DeleteOutlined,
  ExportOutlined,
  KeyOutlined,
  MenuOutlined,
  PlusOutlined,
  ProjectOutlined,
  SaveOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import {
  createModelApiKey,
  createAdminProject,
  deleteModelApiKey,
  getApiErrorMessage,
  loadModelConfigs,
  loadProjectManagementDashboard,
  saveModelConfig,
  updateModelApiKey,
  type AdminDashboard,
  type AdminModelApiKey,
  type AdminModelConfig,
  type AdminModelConfigType,
  type AdminProjectPriority,
  type AdminProject as Project,
  type AdminProjectStatus as ProjectStatus,
  type AdminTask as Task,
} from "./api";

const { Content, Header, Sider } = Layout;
const { Text, Title } = Typography;

type NavigationKey = "overview" | "projects" | "tasks" | "members" | "settings";
type ExportStatus = "idle" | "done";

type CreateProjectForm = {
  budget?: string;
  dueDate?: string;
  key?: string;
  name: string;
  owner: string;
  priority: AdminProjectPriority;
  progress: number;
  status: ProjectStatus;
  team?: string;
};

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
  { icon: <SettingOutlined />, key: "settings", label: "模型配置" },
];

const modelConfigTypes: AdminModelConfigType[] = ["text", "image"];

const modelConfigLabels: Record<AdminModelConfigType, string> = {
  image: "图片模型",
  text: "文本模型",
};

type ModelConfigForm = {
  baseUrl: string;
  modelName: string;
};

type ModelConfigFormState = Record<AdminModelConfigType, ModelConfigForm>;
type ModelApiKeyForm = {
  apiKey: string;
  name: string;
};
type ModelApiKeyFormState = Record<AdminModelConfigType, ModelApiKeyForm>;

const emptyModelConfigForm: ModelConfigFormState = {
  image: {
    baseUrl: "",
    modelName: "",
  },
  text: {
    baseUrl: "",
    modelName: "",
  },
};

const emptyModelApiKeyForm: ModelApiKeyFormState = {
  image: {
    apiKey: "",
    name: "",
  },
  text: {
    apiKey: "",
    name: "",
  },
};

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

type ModelConfigState = {
  data: AdminModelConfig[];
  errorMessage: string | null;
  status: "error" | "loading" | "ready";
};

function createModelConfigFormState(configs: AdminModelConfig[]) {
  return modelConfigTypes.reduce<ModelConfigFormState>(
    (formState, type) => {
      const config = configs.find((item) => item.type === type);

      formState[type] = {
        baseUrl: config?.baseUrl ?? "",
        modelName: config?.modelName ?? "",
      };

      return formState;
    },
    {
      image: { ...emptyModelConfigForm.image },
      text: { ...emptyModelConfigForm.text },
    },
  );
}

const activeMenuTitles: Record<NavigationKey, string> = {
  members: "成员管理",
  overview: "项目总览",
  projects: "项目列表",
  settings: "模型配置",
  tasks: "任务看板",
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
  const [createProjectForm] = Form.useForm<CreateProjectForm>();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [dashboardState, setDashboardState] = useState<DashboardState>({
    data: emptyDashboard,
    errorMessage: null,
    status: "loading",
  });
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [creatingApiKey, setCreatingApiKey] =
    useState<AdminModelConfigType | null>(null);
  const [mutatingApiKeyId, setMutatingApiKeyId] = useState<string | null>(null);
  const [modelApiKeyForms, setModelApiKeyForms] =
    useState<ModelApiKeyFormState>(emptyModelApiKeyForm);
  const [modelConfigForms, setModelConfigForms] =
    useState<ModelConfigFormState>(emptyModelConfigForm);
  const [modelConfigState, setModelConfigState] = useState<ModelConfigState>({
    data: [],
    errorMessage: null,
    status: "loading",
  });
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [savingModelConfig, setSavingModelConfig] =
    useState<AdminModelConfigType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "全部">(
    "全部",
  );

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

  useEffect(() => {
    let active = true;

    loadModelConfigs()
      .then((data) => {
        if (!active) {
          return;
        }

        setModelConfigState({
          data,
          errorMessage: null,
          status: "ready",
        });
        setModelConfigForms(createModelConfigFormState(data));
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setModelConfigState({
          data: [],
          errorMessage: getApiErrorMessage(error),
          status: "error",
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const { capabilities, metrics, notifications, projects, riskQueue, tasks } =
    dashboardState.data;
  const dashboardLoading = dashboardState.status === "loading";
  const modelConfigLoading = modelConfigState.status === "loading";
  const modelConfigByType = useMemo(
    () =>
      new Map(
        modelConfigState.data.map((config) => [config.type, config] as const),
      ),
    [modelConfigState.data],
  );

  const updateModelConfigForm = (
    type: AdminModelConfigType,
    field: keyof ModelConfigForm,
    value: string,
  ) => {
    setModelConfigForms((current) => ({
      ...current,
      [type]: {
        ...current[type],
        [field]: value,
      },
    }));
  };

  const updateModelApiKeyForm = (
    type: AdminModelConfigType,
    field: keyof ModelApiKeyForm,
    value: string,
  ) => {
    setModelApiKeyForms((current) => ({
      ...current,
      [type]: {
        ...current[type],
        [field]: value,
      },
    }));
  };

  const updateModelConfigApiKeys = (
    type: AdminModelConfigType,
    updater: (apiKeys: AdminModelApiKey[]) => AdminModelApiKey[],
  ) => {
    setModelConfigState((current) => ({
      ...current,
      data: current.data.map((config) => {
        if (config.type !== type) {
          return config;
        }

        const oldApiKeys = config.apiKeys ?? [];
        const apiKeys = updater(oldApiKeys);
        const legacyPreview =
          oldApiKeys.length === 0 && config.apiKeyPreview
            ? config.apiKeyPreview
            : null;
        const firstVisibleKey =
          apiKeys.find((apiKey) => apiKey.enabled) ?? apiKeys[0] ?? null;

        return {
          ...config,
          apiKeyPreview: firstVisibleKey?.apiKeyPreview ?? legacyPreview,
          apiKeys,
          hasApiKey: Boolean(legacyPreview) || apiKeys.length > 0,
        };
      }),
    }));
  };

  const handleSaveModelConfig = async (type: AdminModelConfigType) => {
    const form = modelConfigForms[type];

    setSavingModelConfig(type);
    try {
      const saved = await saveModelConfig(type, {
        baseUrl: form.baseUrl,
        modelName: form.modelName,
      });

      setModelConfigState((current) => {
        const others = current.data.filter((item) => item.type !== type);

        return {
          data: [...others, saved].sort(
            (left, right) =>
              modelConfigTypes.indexOf(left.type) -
              modelConfigTypes.indexOf(right.type),
          ),
          errorMessage: null,
          status: "ready",
        };
      });
      setModelConfigForms((current) => ({
        ...current,
        [type]: {
          baseUrl: saved.baseUrl,
          modelName: saved.modelName,
        },
      }));
      setOperationNotice(`${modelConfigLabels[type]}已保存`);
    } catch (error) {
      setOperationNotice(getApiErrorMessage(error));
    } finally {
      setSavingModelConfig(null);
    }
  };

  const handleCreateModelApiKey = async (type: AdminModelConfigType) => {
    const form = modelApiKeyForms[type];
    const name = form.name.trim();
    const apiKey = form.apiKey.trim();

    if (!name || !apiKey) {
      setOperationNotice("请填写 API Key 名称和值");
      return;
    }

    setCreatingApiKey(type);
    try {
      const created = await createModelApiKey(type, {
        apiKey,
        enabled: true,
        name,
      });

      updateModelConfigApiKeys(type, (apiKeys) => [...apiKeys, created]);
      setModelApiKeyForms((current) => ({
        ...current,
        [type]: { ...emptyModelApiKeyForm[type] },
      }));
      setOperationNotice(`${modelConfigLabels[type]} API Key 已新增`);
    } catch (error) {
      setOperationNotice(getApiErrorMessage(error));
    } finally {
      setCreatingApiKey(null);
    }
  };

  const handleToggleModelApiKey = async (
    type: AdminModelConfigType,
    apiKey: AdminModelApiKey,
    enabled: boolean,
  ) => {
    setMutatingApiKeyId(apiKey.id);
    try {
      const updated = await updateModelApiKey(type, apiKey.id, { enabled });

      updateModelConfigApiKeys(type, (apiKeys) =>
        apiKeys.map((item) => (item.id === updated.id ? updated : item)),
      );
      setOperationNotice(`${updated.name}已${enabled ? "启用" : "停用"}`);
    } catch (error) {
      setOperationNotice(getApiErrorMessage(error));
    } finally {
      setMutatingApiKeyId(null);
    }
  };

  const handleDeleteModelApiKey = async (
    type: AdminModelConfigType,
    apiKey: AdminModelApiKey,
  ) => {
    setMutatingApiKeyId(apiKey.id);
    try {
      await deleteModelApiKey(type, apiKey.id);

      updateModelConfigApiKeys(type, (apiKeys) =>
        apiKeys.filter((item) => item.id !== apiKey.id),
      );
      setOperationNotice(`${apiKey.name}已删除`);
    } catch (error) {
      setOperationNotice(getApiErrorMessage(error));
    } finally {
      setMutatingApiKeyId(null);
    }
  };

  const handleCreateProject = async () => {
    try {
      const values = await createProjectForm.validateFields();

      setCreatingProject(true);
      const created = await createAdminProject({
        budget: values.budget,
        dueDate: values.dueDate,
        key: values.key,
        name: values.name,
        owner: values.owner,
        priority: values.priority,
        progress: values.progress,
        status: values.status,
        team: values.team
          ?.split(/[，,\n]/)
          .map((member) => member.trim())
          .filter(Boolean),
      });
      const data = await loadProjectManagementDashboard();

      setDashboardState({
        data,
        errorMessage: null,
        status: "ready",
      });
      setCreateProjectOpen(false);
      createProjectForm.resetFields();
      setOperationNotice(`${created.name}已创建`);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "errorFields" in error
      ) {
        return;
      }

      setOperationNotice(getApiErrorMessage(error));
    } finally {
      setCreatingProject(false);
    }
  };

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

    if (nextKey === "settings") {
      document
        .getElementById("model-configs")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      setOperationNotice("已跳转到模型配置");
      return;
    }

    if (nextKey === "overview") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setOperationNotice("已回到项目总览");
      return;
    }

    setOperationNotice("成员管理入口已记录，待权限功能上线后开放");
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
      inlineCollapsed={siderCollapsed}
      items={menuItems}
      mode="inline"
      onClick={handleMenuClick}
      selectedKeys={[activeMenu]}
      theme="dark"
    />
  );
  const mobileNavigation = (
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
      <Sider
        className="admin-sider"
        collapsible
        collapsed={siderCollapsed}
        collapsedWidth={72}
        onCollapse={setSiderCollapsed}
        width={siderCollapsed ? 72 : 232}
      >
        <div
          className={`admin-brand ${
            siderCollapsed ? "admin-brand-collapsed" : ""
          }`}
        >
          <span>R</span>
          <div aria-hidden={siderCollapsed}>
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
            <Title level={2}>{activeMenuTitles[activeMenu]}</Title>
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
              description={dashboardState.errorMessage}
              showIcon
              title="项目管理接口加载失败"
              type="error"
            />
          ) : null}

          {operationNotice ? (
            <Alert
              className="operation-alert"
              closable={{ onClose: () => setOperationNotice(null) }}
              showIcon
              title={operationNotice}
              type={exportStatus === "done" ? "success" : "info"}
            />
          ) : null}

          {createProjectOpen ? (
            <Card
              className="admin-card create-project-panel"
              extra={
                <Button
                  onClick={() => {
                    setCreateProjectOpen(false);
                    createProjectForm.resetFields();
                  }}
                >
                  收起
                </Button>
              }
              title="新建项目"
            >
              <Form
                form={createProjectForm}
                initialValues={{
                  priority: "P1",
                  progress: 0,
                  status: "规划中",
                }}
                layout="vertical"
              >
                <Form.Item
                  label="项目名称"
                  name="name"
                  rules={[{ message: "请输入项目名称", required: true }]}
                >
                  <Input placeholder="例如：生成链路真实化" />
                </Form.Item>
                <Form.Item
                  label="负责人"
                  name="owner"
                  rules={[{ message: "请输入负责人", required: true }]}
                >
                  <Input placeholder="例如：林舟" />
                </Form.Item>
                <Flex gap={12} wrap>
                  <Form.Item
                    className="project-form-item"
                    label="状态"
                    name="status"
                  >
                    <Select
                      options={["规划中", "进行中", "风险", "已上线"].map(
                        (value) => ({
                          label: value,
                          value,
                        }),
                      )}
                    />
                  </Form.Item>
                  <Form.Item
                    className="project-form-item"
                    label="优先级"
                    name="priority"
                  >
                    <Select
                      options={["P0", "P1", "P2"].map((value) => ({
                        label: value,
                        value,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    className="project-form-item"
                    label="进度"
                    name="progress"
                  >
                    <InputNumber max={100} min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Flex>
                <Flex gap={12} wrap>
                  <Form.Item
                    className="project-form-item"
                    label="预算"
                    name="budget"
                  >
                    <Input placeholder="例如：8w" />
                  </Form.Item>
                  <Form.Item
                    className="project-form-item"
                    label="截止日期"
                    name="dueDate"
                  >
                    <Input placeholder="例如：07/01" />
                  </Form.Item>
                </Flex>
                <Form.Item label="成员" name="team">
                  <Input placeholder="用逗号分隔，例如：林舟，Mia，Kevin" />
                </Form.Item>
                <Form.Item label="项目 Key" name="key">
                  <Input placeholder="可选，例如：real-runtime" />
                </Form.Item>
                <Flex gap={8} justify="end">
                  <Button
                    onClick={() => {
                      setCreateProjectOpen(false);
                      createProjectForm.resetFields();
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    disabled={!capabilities.canCreateProject}
                    loading={creatingProject}
                    onClick={() => void handleCreateProject()}
                    type="primary"
                  >
                    创建项目
                  </Button>
                </Flex>
              </Form>
            </Card>
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
              <Statistic
                title="本周完成任务"
                value={metrics.weeklyCompletedTasks}
              />
            </Card>
            <Card>
              <Statistic
                styles={{ content: { color: "#b20d2a" } }}
                title="风险项目"
                value={metrics.riskProjects}
              />
            </Card>
            <Card>
              <Statistic
                title="平均进度"
                value={metrics.averageProgress}
                suffix="%"
              />
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

          {modelConfigState.status === "error" ? (
            <Alert
              description={modelConfigState.errorMessage}
              showIcon
              title="模型配置接口加载失败"
              type="error"
            />
          ) : null}

          <Card
            className="admin-card model-config-section"
            id="model-configs"
            title={
              <Flex align="center" gap={8} wrap>
                <KeyOutlined />
                <span>模型配置</span>
                <Tag>API Key 不明文回显</Tag>
              </Flex>
            }
          >
            <div className="model-config-grid">
              {modelConfigTypes.map((type) => {
                const config = modelConfigByType.get(type);
                const apiKeys = config?.apiKeys ?? [];
                const activeRuntimeKeyId = apiKeys.find(
                  (apiKey) => apiKey.enabled,
                )?.id;
                const form = modelConfigForms[type];
                const saveDisabled =
                  modelConfigLoading ||
                  !form.baseUrl.trim() ||
                  !form.modelName.trim();

                return (
                  <Card
                    className="model-config-card"
                    key={type}
                    loading={modelConfigLoading}
                    title={modelConfigLabels[type]}
                  >
                    <div className="model-config-fields">
                      <label>
                        <Text strong>Base URL</Text>
                        <Input
                          onChange={(event) =>
                            updateModelConfigForm(
                              type,
                              "baseUrl",
                              event.target.value,
                            )
                          }
                          placeholder="https://api.example.com/v1"
                          value={form.baseUrl}
                        />
                      </label>
                      <label>
                        <Text strong>模型名称</Text>
                        <Input
                          onChange={(event) =>
                            updateModelConfigForm(
                              type,
                              "modelName",
                              event.target.value,
                            )
                          }
                          placeholder={
                            type === "text" ? "gpt-4.1-mini" : "gpt-image-1"
                          }
                          value={form.modelName}
                        />
                      </label>
                    </div>

                    <Flex
                      align="center"
                      className="model-config-footer"
                      gap={10}
                      justify="space-between"
                      wrap
                    >
                      <Text type="secondary">
                        {config?.baseUrl && config?.modelName
                          ? "模型连接信息已配置"
                          : "请先配置模型连接信息"}
                      </Text>
                      <Button
                        disabled={saveDisabled}
                        icon={<SaveOutlined />}
                        loading={savingModelConfig === type}
                        onClick={() => void handleSaveModelConfig(type)}
                        type="primary"
                      >
                        保存配置
                      </Button>
                    </Flex>

                    <div className="api-key-panel">
                      <Flex align="center" justify="space-between" wrap>
                        <Text strong>API Key</Text>
                        <Tag>{apiKeys.length} 个</Tag>
                      </Flex>

                      <div className="api-key-create-row">
                        <Input
                          onChange={(event) =>
                            updateModelApiKeyForm(
                              type,
                              "name",
                              event.target.value,
                            )
                          }
                          placeholder="Key 名称，例如：主账号"
                          value={modelApiKeyForms[type].name}
                        />
                        <Input.Password
                          onChange={(event) =>
                            updateModelApiKeyForm(
                              type,
                              "apiKey",
                              event.target.value,
                            )
                          }
                          placeholder="输入新的 API Key"
                          value={modelApiKeyForms[type].apiKey}
                        />
                        <Button
                          disabled={
                            !modelApiKeyForms[type].name.trim() ||
                            !modelApiKeyForms[type].apiKey.trim()
                          }
                          icon={<PlusOutlined />}
                          loading={creatingApiKey === type}
                          onClick={() => void handleCreateModelApiKey(type)}
                          type="primary"
                        >
                          新增 API Key
                        </Button>
                      </div>

                      <div className="api-key-list">
                        {apiKeys.length ? (
                          apiKeys.map((apiKey) => (
                            <div className="api-key-item" key={apiKey.id}>
                              <div className="api-key-item-main">
                                <Text strong>{apiKey.name}</Text>
                                {apiKey.id === activeRuntimeKeyId ? (
                                  <Tag color="processing">运行使用</Tag>
                                ) : null}
                                <Text code>{apiKey.apiKeyPreview}</Text>
                              </div>
                              <Space size={8}>
                                <Switch
                                  checked={apiKey.enabled}
                                  checkedChildren="启用"
                                  disabled={mutatingApiKeyId === apiKey.id}
                                  loading={mutatingApiKeyId === apiKey.id}
                                  onChange={(checked) =>
                                    void handleToggleModelApiKey(
                                      type,
                                      apiKey,
                                      checked,
                                    )
                                  }
                                  unCheckedChildren="停用"
                                />
                                <Popconfirm
                                  cancelText="取消"
                                  okText="删除"
                                  onConfirm={() =>
                                    void handleDeleteModelApiKey(type, apiKey)
                                  }
                                  title="删除 API Key"
                                >
                                  <Button
                                    aria-label={`删除 ${apiKey.name}`}
                                    danger
                                    disabled={mutatingApiKeyId === apiKey.id}
                                    icon={<DeleteOutlined />}
                                  />
                                </Popconfirm>
                              </Space>
                            </div>
                          ))
                        ) : (
                          <Empty
                            description="还没有 API Key"
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                          />
                        )}
                        {apiKeys.length && !activeRuntimeKeyId ? (
                          <Text type="warning">
                            当前没有启用的 API Key，模型调用会失败。
                          </Text>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
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
        {mobileNavigation}
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
                  description={selectedProject.riskReason}
                  showIcon
                  title="风险处置"
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
