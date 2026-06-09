export type AdminContentProviderType = 'tikhub' | 'custom';

export type AdminContentProviderApiKeyView = {
  apiKeyPreview: string | null;
  createdAt: Date;
  enabled: boolean;
  id: string;
  name: string;
  type: AdminContentProviderType;
  updatedAt: Date;
};

export type AdminContentProviderConfigView = {
  apiKeyPreview: string | null;
  apiKeys: AdminContentProviderApiKeyView[];
  baseUrl: string;
  complianceNote: string;
  enabled: boolean;
  hasApiKey: boolean;
  name: string;
  rateLimitPerMinute: number | null;
  type: AdminContentProviderType;
  updatedAt: Date | null;
};

export type AdminContentProviderRuntimeConfig = {
  apiKey: string;
  baseUrl: string;
  complianceNote: string;
  enabled: boolean;
  rateLimitPerMinute: number | null;
  type: AdminContentProviderType;
};

export const adminContentProviderTypes: AdminContentProviderType[] = [
  'tikhub',
  'custom',
];

export const adminContentProviderDefaults: Record<
  AdminContentProviderType,
  { baseUrl: string; complianceNote: string; name: string }
> = {
  custom: {
    baseUrl: '',
    complianceNote: '仅接入用户授权或自行导入的小红书内容样本。',
    name: '自定义小红书数据服务',
  },
  tikhub: {
    baseUrl: '',
    complianceNote: '仅用于用户授权的笔记、账号和搜索结果导入。',
    name: 'TikHub 兼容服务',
  },
};
