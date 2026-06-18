import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { RuntimeModelConfig } from "../admin/runtime-secrets.service.js";

export const MODEL_SETUP_MESSAGE =
  "需要配置模型后才能运行 Mira。请登录 /admin，在 Key 配置里填写模型 Base URL、模型名称和模型 API Key。";

export class ModelConfigurationError extends Error {
  constructor(message = MODEL_SETUP_MESSAGE) {
    super(message);
    this.name = "ModelConfigurationError";
  }
}

export function createAgentModel(config: RuntimeModelConfig): LanguageModel {
  if (!config.baseURL || !config.apiKey || !config.modelName) {
    throw new ModelConfigurationError();
  }

  return createOpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey
  }).chat(config.modelName);
}
