export type ManagedSecretKey =
  | "AGENT_MODEL_BASE_URL"
  | "AGENT_MODEL_NAME"
  | "AGENT_MODEL_API_KEY"
  | "TAVILY_API_KEY"
  | "RESEND_API_KEY"
  | "RESEND_FROM"
  | "RESEND_TEMPLATE_ID"
  | "RESEND_TEMPLATE_CODE_VARIABLE"
  | "OPENAI_IMAGE_API_KEY"
  | "OPENAI_IMAGE_BASE_URL"
  | "OPENAI_IMAGE_MODEL"
  | "IMAGE_PROVIDER"
  | "IMAGE_STORAGE_PROVIDER"
  | "IMAGE_STORAGE_BUCKET"
  | "IMAGE_STORAGE_REGION"
  | "IMAGE_STORAGE_ENDPOINT"
  | "IMAGE_STORAGE_ACCESS_KEY"
  | "IMAGE_STORAGE_SECRET_KEY"
  | "IMAGE_MAX_DAILY_TASKS_PER_USER"
  | "IMAGE_MAX_IMAGE_SIZE_MB"
  | "IMAGE_DEFAULT_QUALITY";

export type ManagedSecretDefinition = {
  key: ManagedSecretKey;
  label: string;
  sensitive: boolean;
};

export type ManagedSecretView = {
  key: ManagedSecretKey;
  label: string;
  value: string;
  masked: boolean;
};

export type AdminStoreData = {
  passwordHash?: string;
  secrets?: Partial<Record<ManagedSecretKey, string>>;
};

export const MANAGED_SECRETS: ManagedSecretDefinition[] = [
  {
    key: "AGENT_MODEL_BASE_URL",
    label: "模型 Base URL",
    sensitive: false
  },
  {
    key: "AGENT_MODEL_NAME",
    label: "模型名称",
    sensitive: false
  },
  {
    key: "AGENT_MODEL_API_KEY",
    label: "模型 API Key",
    sensitive: true
  },
  {
    key: "TAVILY_API_KEY",
    label: "Tavily 搜索 Key",
    sensitive: true
  },
  {
    key: "RESEND_API_KEY",
    label: "Resend API Key",
    sensitive: true
  },
  {
    key: "RESEND_FROM",
    label: "Resend From",
    sensitive: false
  },
  {
    key: "RESEND_TEMPLATE_ID",
    label: "Resend Template ID",
    sensitive: false
  },
  {
    key: "RESEND_TEMPLATE_CODE_VARIABLE",
    label: "Resend 验证码变量名",
    sensitive: false
  },
  {
    key: "OPENAI_IMAGE_API_KEY",
    label: "OpenAI 图像 API Key",
    sensitive: true
  },
  {
    key: "OPENAI_IMAGE_BASE_URL",
    label: "OpenAI 图像 Base URL",
    sensitive: false
  },
  {
    key: "OPENAI_IMAGE_MODEL",
    label: "OpenAI 图像模型",
    sensitive: false
  },
  {
    key: "IMAGE_PROVIDER",
    label: "图像生成 Provider",
    sensitive: false
  },
  {
    key: "IMAGE_STORAGE_PROVIDER",
    label: "图像存储 Provider",
    sensitive: false
  },
  {
    key: "IMAGE_STORAGE_BUCKET",
    label: "图像存储 Bucket",
    sensitive: false
  },
  {
    key: "IMAGE_STORAGE_REGION",
    label: "图像存储 Region",
    sensitive: false
  },
  {
    key: "IMAGE_STORAGE_ENDPOINT",
    label: "图像存储 Endpoint",
    sensitive: false
  },
  {
    key: "IMAGE_STORAGE_ACCESS_KEY",
    label: "图像存储 Access Key",
    sensitive: true
  },
  {
    key: "IMAGE_STORAGE_SECRET_KEY",
    label: "图像存储 Secret Key",
    sensitive: true
  },
  {
    key: "IMAGE_MAX_DAILY_TASKS_PER_USER",
    label: "用户每日图像任务上限",
    sensitive: false
  },
  {
    key: "IMAGE_MAX_IMAGE_SIZE_MB",
    label: "图像最大体积 MB",
    sensitive: false
  },
  {
    key: "IMAGE_DEFAULT_QUALITY",
    label: "图像默认质量",
    sensitive: false
  }
];

export function isManagedSecretKey(value: string): value is ManagedSecretKey {
  return MANAGED_SECRETS.some((secret) => secret.key === value);
}
