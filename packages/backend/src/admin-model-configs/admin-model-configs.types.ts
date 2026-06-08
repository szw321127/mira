export type AdminModelConfigType = 'text' | 'image';

export type AdminModelConfigView = {
  apiKeyPreview: string | null;
  baseUrl: string;
  hasApiKey: boolean;
  modelName: string;
  type: AdminModelConfigType;
  updatedAt: Date | null;
};

export type AdminModelRuntimeConfig = {
  apiKey: string;
  baseUrl: string;
  modelName: string;
  type: AdminModelConfigType;
};

export const adminModelConfigTypes: AdminModelConfigType[] = ['text', 'image'];
