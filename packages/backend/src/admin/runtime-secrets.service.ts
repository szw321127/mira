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

  private async readSecrets(): Promise<Partial<Record<ManagedSecretKey, string>>> {
    const store = await this.store.read();
    return store.secrets ?? {};
  }
}
