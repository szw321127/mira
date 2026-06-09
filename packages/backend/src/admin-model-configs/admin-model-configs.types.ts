export type AdminModelConfigType = 'text' | 'image';

export type AdminModelConfigView = {
  apiKeys: AdminModelApiKeyView[];
  apiKeyPreview: string | null;
  baseUrl: string;
  hasApiKey: boolean;
  modelName: string;
  type: AdminModelConfigType;
  updatedAt: Date | null;
};

export type AdminModelApiKeyView = {
  apiKeyPreview: string | null;
  createdAt: Date;
  enabled: boolean;
  id: string;
  name: string;
  type: AdminModelConfigType;
  updatedAt: Date;
};

export type AdminModelConnectionTestResult = {
  checkedAt: string;
  endpoint: string;
  modelName: string;
  ok: true;
  type: AdminModelConfigType;
};

export type AdminModelRuntimeConfig = {
  apiKey: string;
  baseUrl: string;
  modelName: string;
  type: AdminModelConfigType;
};

export const adminModelConfigTypes: AdminModelConfigType[] = ['text', 'image'];
