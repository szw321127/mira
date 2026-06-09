import {
  BellOutlined,
  ExportOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  Layout,
  Menu,
  Progress,
  Space,
  Tag,
  Timeline,
  Typography,
} from "antd";
import type { MenuProps, TableProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import {
  changeAdminPassword,
  createAdminProject,
  createModelApiKey,
  deleteModelApiKey,
  getApiErrorMessage,
  loadModelConfigs,
  loadProjectManagementDashboard,
  saveModelConfig,
  updateAdminProfile,
  updateModelApiKey,
  type AdminModelApiKey,
  type AdminModelConfigType,
  type AdminProfile,
  type AdminProject as Project,
  type AdminProjectStatus as ProjectStatus,
  type AdminTask as Task,
} from "../api";
import {
  buildProjectCsv,
  createModelConfigFormState,
  emptyDashboard,
  emptyModelApiKeyForm,
  emptyModelConfigForm,
  matchesQuery,
  modelConfigTypes,
  statusColor,
  taskColor,
  type AdminPasswordForm,
  type AdminProfileForm,
  type CreateProjectForm,
  type DashboardState,
  type ExportStatus,
  type ModelApiKeyForm,
  type ModelApiKeyFormState,
  type ModelConfigForm,
  type ModelConfigFormState,
  type ModelConfigState,
} from "./adminTypes";
import { activeMenuTitles, menuItems, type NavigationKey } from "./navigation";
import { AdminProfilePage } from "./pages/AdminProfilePage";
import { MembersPage } from "./pages/MembersPage";
import { ModelConfigsPage } from "./pages/ModelConfigsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { TasksPage } from "./pages/TasksPage";

const { Content, Header, Sider } = Layout;
const { Text, Title } = Typography;

type AdminWorkspaceProps = {
  admin: AdminProfile;
  onAdminUpdated: (admin: AdminProfile) => void;
  onLogout: () => void;
  onUnauthorized: (error: unknown) => boolean;
};

export function AdminWorkspace({
  admin,
  onAdminUpdated,
  onLogout,
  onUnauthorized,
}: AdminWorkspaceProps) {
  const [activeMenu, setActiveMenu] = useState<NavigationKey>("overview");
  const [createProjectForm] = Form.useForm<CreateProjectForm>();
  const [passwordForm] = Form.useForm<AdminPasswordForm>();
  const [profileForm] = Form.useForm<AdminProfileForm>();
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
  const [savingAdminPassword, setSavingAdminPassword] = useState(false);
  const [savingAdminProfile, setSavingAdminProfile] = useState(false);
  const [savingModelConfig, setSavingModelConfig] =
    useState<AdminModelConfigType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "全部">(
    "全部",
  );

  const handleAdminApiError = (error: unknown) => {
    if (onUnauthorized(error)) {
      return true;
    }

    setOperationNotice(getApiErrorMessage(error));
    return false;
  };

  useEffect(() => {
    profileForm.setFieldsValue({
      displayName: admin.displayName,
    });
  }, [admin.displayName, profileForm]);

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

        if (onUnauthorized(error)) {
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

        if (onUnauthorized(error)) {
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
      setOperationNotice(`${type === "text" ? "文本模型" : "图片模型"}已保存`);
    } catch (error) {
      handleAdminApiError(error);
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
      setOperationNotice(
        `${type === "text" ? "文本模型" : "图片模型"} API Key 已新增`,
      );
    } catch (error) {
      handleAdminApiError(error);
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
      handleAdminApiError(error);
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
      handleAdminApiError(error);
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

      handleAdminApiError(error);
    } finally {
      setCreatingProject(false);
    }
  };

  const handleSaveAdminProfile = async () => {
    try {
      const values = await profileForm.validateFields();

      setSavingAdminProfile(true);
      const updated = await updateAdminProfile({
        displayName: values.displayName,
      });

      onAdminUpdated(updated);
      setOperationNotice("管理员信息已更新");
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "errorFields" in error
      ) {
        return;
      }

      handleAdminApiError(error);
    } finally {
      setSavingAdminProfile(false);
    }
  };

  const handleChangeAdminPassword = async () => {
    try {
      const values = await passwordForm.validateFields();

      setSavingAdminPassword(true);
      const updated = await changeAdminPassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });

      onAdminUpdated(updated);
      passwordForm.resetFields();
      setOperationNotice("管理员密码已修改");
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "errorFields" in error
      ) {
        return;
      }

      handleAdminApiError(error);
    } finally {
      setSavingAdminPassword(false);
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
    setOperationNotice(`已打开${activeMenuTitles[nextKey]}`);
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

  const renderActivePage = () => {
    switch (activeMenu) {
      case "overview":
        return (
          <OverviewPage
            metrics={metrics}
            onSelectProject={setSelectedProject}
            riskQueueProjects={riskQueueProjects}
          />
        );
      case "projects":
        return (
          <ProjectsPage
            capabilities={capabilities}
            createProjectForm={createProjectForm}
            createProjectOpen={createProjectOpen}
            creatingProject={creatingProject}
            dashboardLoading={dashboardLoading}
            filteredProjects={filteredProjects}
            onCreateProject={handleCreateProject}
            projectColumns={projectColumns}
            setCreateProjectOpen={setCreateProjectOpen}
            setStatusFilter={setStatusFilter}
            statusFilter={statusFilter}
          />
        );
      case "tasks":
        return (
          <TasksPage
            dashboardLoading={dashboardLoading}
            filteredTasks={filteredTasks}
            taskColumns={taskColumns}
          />
        );
      case "members":
        return <MembersPage />;
      case "settings":
        return (
          <ModelConfigsPage
            creatingApiKey={creatingApiKey}
            modelApiKeyForms={modelApiKeyForms}
            modelConfigByType={modelConfigByType}
            modelConfigForms={modelConfigForms}
            modelConfigLoading={modelConfigLoading}
            modelConfigState={modelConfigState}
            mutatingApiKeyId={mutatingApiKeyId}
            onCreateModelApiKey={handleCreateModelApiKey}
            onDeleteModelApiKey={handleDeleteModelApiKey}
            onSaveModelConfig={handleSaveModelConfig}
            onToggleModelApiKey={handleToggleModelApiKey}
            savingModelConfig={savingModelConfig}
            updateModelApiKeyForm={updateModelApiKeyForm}
            updateModelConfigForm={updateModelConfigForm}
          />
        );
      case "adminProfile":
        return (
          <AdminProfilePage
            admin={admin}
            onChangePassword={handleChangeAdminPassword}
            onSaveProfile={handleSaveAdminProfile}
            passwordForm={passwordForm}
            profileForm={profileForm}
            savingAdminPassword={savingAdminPassword}
            savingAdminProfile={savingAdminProfile}
          />
        );
    }
  };

  return (
    <Layout className="admin-shell">
      <Sider
        className="admin-sider"
        collapsible
        collapsed={siderCollapsed}
        collapsedWidth={72}
        onCollapse={setSiderCollapsed}
        trigger={null}
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
              aria-label={siderCollapsed ? "展开侧边栏" : "收起侧边栏"}
              className="desktop-sider-toggle"
              icon={
                siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />
              }
              onClick={() => setSiderCollapsed((current) => !current)}
            />
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
              icon={<UserOutlined />}
              onClick={() => setActiveMenu("adminProfile")}
            >
              {admin.displayName}
            </Button>
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
              onClick={() => {
                setActiveMenu("projects");
                setCreateProjectOpen(true);
              }}
              type="primary"
            >
              新建项目
            </Button>
            <Button icon={<LogoutOutlined />} onClick={onLogout}>
              退出登录
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

          {renderActivePage()}
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
