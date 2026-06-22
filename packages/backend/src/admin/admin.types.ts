export type ManagedSecretKey =
  | "AGENT_MODEL_BASE_URL"
  | "AGENT_MODEL_NAME"
  | "AGENT_MODEL_API_KEY"
  | "TAVILY_API_KEY"
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_USER"
  | "SMTP_PASSWORD"
  | "SMTP_FROM";

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
    key: "SMTP_HOST",
    label: "SMTP Host",
    sensitive: false
  },
  {
    key: "SMTP_PORT",
    label: "SMTP Port",
    sensitive: false
  },
  {
    key: "SMTP_USER",
    label: "SMTP User",
    sensitive: false
  },
  {
    key: "SMTP_PASSWORD",
    label: "SMTP Password",
    sensitive: true
  },
  {
    key: "SMTP_FROM",
    label: "SMTP From",
    sensitive: false
  }
];

export function isManagedSecretKey(value: string): value is ManagedSecretKey {
  return MANAGED_SECRETS.some((secret) => secret.key === value);
}
