import { Injectable } from "@nestjs/common";
import type { ManagedSecretKey } from "./admin.types.js";
import { AdminStore } from "./admin-store.js";

export type RuntimeModelConfig = {
  baseURL: string;
  apiKey: string;
  modelName: string;
};

export type RuntimeSearchConfig = {
  tavilyApiKey: string;
};

export type RuntimeResendConfig = {
  apiKey: string;
  from: string;
  templateId: string;
  templateCodeVariable: string;
};

export type RuntimeImageConfig = {
  provider: string;
  openaiApiKey: string;
  openaiModel: string;
  storageProvider: string;
  storageBucket: string;
  storageRegion: string;
  storageEndpoint: string;
  storageAccessKey: string;
  storageSecretKey: string;
  maxDailyTasksPerUser: string;
  maxImageSizeMb: string;
  defaultQuality: string;
};

export type RuntimeImageProviderStatus = {
  configured: boolean;
  provider: "openai" | "disabled";
  model: string | null;
  missingKeys: string[];
};

@Injectable()
export class RuntimeSecretsService {
  constructor(private readonly store: AdminStore) {}

  async getModelConfig(): Promise<RuntimeModelConfig> {
    const secrets = await this.readSecrets();
    return {
      baseURL: secrets.AGENT_MODEL_BASE_URL ?? "",
      apiKey: secrets.AGENT_MODEL_API_KEY ?? "",
      modelName: secrets.AGENT_MODEL_NAME ?? ""
    };
  }

  async getSearchConfig(): Promise<RuntimeSearchConfig> {
    const secrets = await this.readSecrets();
    return {
      tavilyApiKey: secrets.TAVILY_API_KEY ?? ""
    };
  }

  async getResendConfig(): Promise<RuntimeResendConfig> {
    const secrets = await this.readSecrets();
    return {
      apiKey: secrets.RESEND_API_KEY ?? "",
      from: secrets.RESEND_FROM ?? "",
      templateId: secrets.RESEND_TEMPLATE_ID ?? "",
      templateCodeVariable: secrets.RESEND_TEMPLATE_CODE_VARIABLE ?? ""
    };
  }

  async getImageConfig(): Promise<RuntimeImageConfig> {
    const secrets = await this.readSecrets();
    return {
      provider: secrets.IMAGE_PROVIDER ?? "openai",
      openaiApiKey: secrets.OPENAI_IMAGE_API_KEY ?? "",
      openaiModel: secrets.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
      storageProvider: secrets.IMAGE_STORAGE_PROVIDER ?? "local",
      storageBucket: secrets.IMAGE_STORAGE_BUCKET ?? "",
      storageRegion: secrets.IMAGE_STORAGE_REGION ?? "",
      storageEndpoint: secrets.IMAGE_STORAGE_ENDPOINT ?? "",
      storageAccessKey: secrets.IMAGE_STORAGE_ACCESS_KEY ?? "",
      storageSecretKey: secrets.IMAGE_STORAGE_SECRET_KEY ?? "",
      maxDailyTasksPerUser: secrets.IMAGE_MAX_DAILY_TASKS_PER_USER ?? "50",
      maxImageSizeMb: secrets.IMAGE_MAX_IMAGE_SIZE_MB ?? "20",
      defaultQuality: secrets.IMAGE_DEFAULT_QUALITY ?? "auto"
    };
  }

  async getImageProviderStatus(): Promise<RuntimeImageProviderStatus> {
    const config = await this.getImageConfig();
    const provider = normalizeImageProvider(config.provider);
    if (provider === "disabled") {
      return {
        configured: false,
        provider,
        model: null,
        missingKeys: []
      };
    }

    const missingKeys = config.openaiApiKey.trim() ? [] : ["OPENAI_IMAGE_API_KEY"];
    return {
      configured: missingKeys.length === 0,
      provider,
      model: config.openaiModel.trim() || "gpt-image-1",
      missingKeys
    };
  }

  private async readSecrets(): Promise<Partial<Record<ManagedSecretKey, string>>> {
    const store = await this.store.read();
    return store.secrets ?? {};
  }
}

function normalizeImageProvider(value: string): RuntimeImageProviderStatus["provider"] {
  return value.trim().toLowerCase() === "disabled" ? "disabled" : "openai";
}
