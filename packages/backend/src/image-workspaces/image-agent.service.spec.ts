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
      aspectRatio: "16:9",
      quality: "high",
      background: "transparent"
    });

    expect(input).toEqual({
      prompt: "make a launch poster",
      target: { x: 32, y: 48 },
      aspectRatio: "16:9",
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
      aspectRatio: "16:9",
      quality: "high",
      background: "transparent"
    });
  });

  it("prepares durable image expand task input", () => {
    const service = new ImageAgentService();

    expect(
      service.prepareTaskInput({
        type: "expand",
        prompt: "  extend the street  ",
        assetId: "asset-1",
        versionId: "version-1",
        mode: "direction",
        direction: "right",
        percent: 0.25,
        padding: { left: 0, right: 256, top: 0, bottom: 0 },
        expandTarget: { width: 1280, height: 1024 },
        aspectRatio: "16:9"
      })
    ).toEqual({
      prompt: "extend the street",
      assetId: "asset-1",
      versionId: "version-1",
      mode: "direction",
      direction: "right",
      percent: 0.25,
      padding: { left: 0, right: 256, top: 0, bottom: 0 },
      expandTarget: { width: 1280, height: 1024 },
      aspectRatio: "16:9"
    });
  });

  it("rebuilds retry requests from previous expand task input", () => {
    const service = new ImageAgentService();

    expect(
      service.createRetryRequest({
        type: "expand",
        input: {
          prompt: "  extend the street  ",
          assetId: "asset-1",
          versionId: "version-1",
          mode: "direction",
          direction: "right",
          percent: 0.25,
          padding: { left: 0, right: 256, top: 0, bottom: 0 },
          expandTarget: { width: 1280, height: 1024 }
        }
      })
    ).toEqual({
      type: "expand",
      prompt: "extend the street",
      assetId: "asset-1",
      versionId: "version-1",
      mode: "direction",
      direction: "right",
      percent: 0.25,
      padding: { left: 0, right: 256, top: 0, bottom: 0 },
      expandTarget: { width: 1280, height: 1024 }
    });
  });

  it("rejects expand retries that cannot rebuild a valid request", () => {
    const service = new ImageAgentService();

    expect(() =>
      service.createRetryRequest({
        type: "expand",
        input: {
          prompt: "extend",
          assetId: "asset-1",
          versionId: "version-1",
          mode: "direction",
          padding: { left: 0, right: 256, top: 0, bottom: 0 },
          expandTarget: { width: 1280, height: 1024 }
        }
      })
    ).toThrow(BadRequestException);
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
