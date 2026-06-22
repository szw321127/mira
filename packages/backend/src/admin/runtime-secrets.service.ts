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

export type RuntimeSmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
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

  async getSmtpConfig(): Promise<RuntimeSmtpConfig> {
    const secrets = await this.readSecrets();
    return {
      host: secrets.SMTP_HOST ?? "",
      port: Number(secrets.SMTP_PORT ?? 0),
      user: secrets.SMTP_USER ?? "",
      password: secrets.SMTP_PASSWORD ?? "",
      from: secrets.SMTP_FROM ?? ""
    };
  }

  private async readSecrets(): Promise<Partial<Record<ManagedSecretKey, string>>> {
    const store = await this.store.read();
    return store.secrets ?? {};
  }
}
