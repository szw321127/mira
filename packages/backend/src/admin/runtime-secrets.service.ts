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

  private async readSecrets(): Promise<Partial<Record<ManagedSecretKey, string>>> {
    const store = await this.store.read();
    return store.secrets ?? {};
  }
}
