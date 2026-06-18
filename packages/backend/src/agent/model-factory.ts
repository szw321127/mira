import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { loadBackendEnv } from "../config/env.js";

export const MODEL_SETUP_MESSAGE =
  "需要配置模型后才能运行 agent。请在 packages/backend/.env 或根目录 .env 设置 AGENT_MODEL_BASE_URL、AGENT_MODEL_API_KEY 和 AGENT_MODEL_NAME；这些值只在后端使用，不要加 NEXT_PUBLIC_。";

export class ModelConfigurationError extends Error {
  constructor(message = MODEL_SETUP_MESSAGE) {
    super(message);
    this.name = "ModelConfigurationError";
  }
}

export function createAgentModel(): LanguageModel {
  loadBackendEnv();

  const baseURL = process.env.AGENT_MODEL_BASE_URL;
  const apiKey = process.env.AGENT_MODEL_API_KEY;
  const modelName = process.env.AGENT_MODEL_NAME;

  if (!baseURL || !apiKey || !modelName) {
    throw new ModelConfigurationError();
  }

  return createOpenAI({ baseURL, apiKey }).chat(modelName);
}
