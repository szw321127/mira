import type {
  AdminDashboard,
  AdminModelConfig,
  AdminModelConfigType,
  AdminProject as Project,
  AdminProjectPriority,
  AdminProjectStatus as ProjectStatus,
  AdminTask as Task,
} from "../api";

export type ExportStatus = "idle" | "done";

export type AdminProfileForm = {
  displayName: string;
};

export type AdminPasswordForm = {
  confirmPassword: string;
  currentPassword: string;
  newPassword: string;
};

export type CreateProjectForm = {
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

export type ModelConfigForm = {
  baseUrl: string;
  modelName: string;
};

export type ModelConfigFormState = Record<
  AdminModelConfigType,
  ModelConfigForm
>;

export type ModelApiKeyForm = {
  apiKey: string;
  name: string;
};

export type ModelApiKeyFormState = Record<
  AdminModelConfigType,
  ModelApiKeyForm
>;

export type DashboardState = {
  data: AdminDashboard;
  errorMessage: string | null;
  status: "error" | "loading" | "ready";
};

export type ModelConfigState = {
  data: AdminModelConfig[];
  errorMessage: string | null;
  status: "error" | "loading" | "ready";
};

export const statusColor: Record<ProjectStatus, string> = {
  已上线: "green",
  规划中: "blue",
  进行中: "processing",
  风险: "error",
};

export const taskColor = {
  已完成: "success",
  待开始: "default",
  推进中: "processing",
  验收中: "warning",
} as const satisfies Record<
  Task["status"],
  "default" | "error" | "processing" | "success" | "warning"
>;

export const modelConfigTypes: AdminModelConfigType[] = ["text", "image"];

export const modelConfigLabels: Record<AdminModelConfigType, string> = {
  image: "图片模型",
  text: "文本模型",
};

export const emptyModelConfigForm: ModelConfigFormState = {
  image: {
    baseUrl: "",
    modelName: "",
  },
  text: {
    baseUrl: "",
    modelName: "",
  },
};

export const emptyModelApiKeyForm: ModelApiKeyFormState = {
  image: {
    apiKey: "",
    name: "",
  },
  text: {
    apiKey: "",
    name: "",
  },
};

export const emptyDashboard: AdminDashboard = {
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

export function createModelConfigFormState(configs: AdminModelConfig[]) {
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

export function matchesQuery(values: Array<string | number>, query: string) {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  return values
    .map((value) => String(value).toLocaleLowerCase())
    .some((value) => value.includes(normalizedQuery));
}

export function buildProjectCsv(rows: Project[]) {
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
