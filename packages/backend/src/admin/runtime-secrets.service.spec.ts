import { RuntimeSecretsService } from "./runtime-secrets.service.js";
import type { AdminStore } from "./admin-store.js";
import type { AdminStoreData } from "./admin.types.js";

function createStore(data: AdminStoreData) {
  return {
    read: () => Promise.resolve(data)
  } as unknown as AdminStore;
}

describe("RuntimeSecretsService", () => {
  it("reports image generation as disabled when the provider is disabled", async () => {
    const service = new RuntimeSecretsService(
      createStore({
        secrets: {
          IMAGE_PROVIDER: "disabled",
          OPENAI_IMAGE_API_KEY: "sk-live-secret",
          OPENAI_IMAGE_MODEL: "gpt-image-1"
        }
      })
    );

    await expect(service.getImageProviderStatus()).resolves.toEqual({
      configured: false,
      provider: "disabled",
      model: null,
      missingKeys: []
    });
  });

  it("reports missing image configuration without exposing secret values", async () => {
    const service = new RuntimeSecretsService(
      createStore({
        secrets: {
          IMAGE_PROVIDER: "openai",
          OPENAI_IMAGE_MODEL: "gpt-image-1"
        }
      })
    );

    await expect(service.getImageProviderStatus()).resolves.toEqual({
      configured: false,
      provider: "openai",
      model: "gpt-image-1",
      missingKeys: ["OPENAI_IMAGE_API_KEY"]
    });
  });

  it("reports configured OpenAI image generation with model only", async () => {
    const service = new RuntimeSecretsService(
      createStore({
        secrets: {
          IMAGE_PROVIDER: "openai",
          OPENAI_IMAGE_API_KEY: "sk-live-secret",
          OPENAI_IMAGE_MODEL: "gpt-image-1"
        }
      })
    );

    await expect(service.getImageProviderStatus()).resolves.toEqual({
      configured: true,
      provider: "openai",
      model: "gpt-image-1",
      missingKeys: []
    });
  });

  it("loads the OpenAI image base URL from managed secrets", async () => {
    const service = new RuntimeSecretsService(
      createStore({
        secrets: {
          IMAGE_PROVIDER: "openai",
          OPENAI_IMAGE_API_KEY: "sk-live-secret",
          OPENAI_IMAGE_BASE_URL: "https://image-gateway.example/v1",
          OPENAI_IMAGE_MODEL: "gpt-image-1"
        }
      })
    );

    await expect(service.getImageConfig()).resolves.toEqual(
      expect.objectContaining({
        openaiBaseURL: "https://image-gateway.example/v1"
      })
    );
  });
});
