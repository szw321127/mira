import { BadRequestException } from "@nestjs/common";
import { ImageAgentService } from "./image-agent.service.js";

describe("ImageAgentService", () => {
  it("prepares durable image task input without raw provider fields", () => {
    const service = new ImageAgentService();

    expect(
      service.prepareTaskInput({
        type: "edit",
        prompt: "  调整产品背景  ",
        target: { x: 120, y: 160 },
        assetId: "asset-1",
        versionId: "version-1",
        maskKey: "local/user/workspace/mask.png",
        size: "1024x1536"
      })
    ).toEqual({
      prompt: "调整产品背景",
      target: { x: 120, y: 160 },
      assetId: "asset-1",
      versionId: "version-1",
      maskKey: "local/user/workspace/mask.png",
      size: "1024x1536"
    });
  });

  it("prepares and retries generation settings", () => {
    const service = new ImageAgentService();

    const input = service.prepareTaskInput({
      type: "generate",
      prompt: "  make a launch poster  ",
      target: { x: 32, y: 48 },
      size: "1536x1024",
      quality: "high",
      background: "transparent"
    });

    expect(input).toEqual({
      prompt: "make a launch poster",
      target: { x: 32, y: 48 },
      size: "1536x1024",
      quality: "high",
      background: "transparent"
    });
    expect(
      service.createRetryRequest({
        type: "generate",
        input
      })
    ).toEqual({
      type: "generate",
      prompt: "make a launch poster",
      target: { x: 32, y: 48 },
      size: "1536x1024",
      quality: "high",
      background: "transparent"
    });
  });

  it("rebuilds retry requests from previous task input", () => {
    const service = new ImageAgentService();

    expect(
      service.createRetryRequest({
        type: "variation",
        input: {
          prompt: "  做一个变体  ",
          target: { x: 30, y: 40 },
          assetId: "asset-1",
          versionId: "version-1"
        }
      })
    ).toEqual({
      type: "variation",
      prompt: "做一个变体",
      target: { x: 30, y: 40 },
      assetId: "asset-1",
      versionId: "version-1"
    });
  });

  it("rejects retry requests when the previous task input has no prompt", () => {
    const service = new ImageAgentService();

    expect(() =>
      service.createRetryRequest({
        type: "generate",
        input: {
          target: { x: 30, y: 40 }
        }
      })
    ).toThrow(BadRequestException);
  });
});
