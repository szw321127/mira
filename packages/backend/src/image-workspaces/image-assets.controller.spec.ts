import { jest } from "@jest/globals";
import { StreamableFile } from "@nestjs/common";
import type { Request } from "express";
import type { UserSessionService } from "../auth/user-session.service.js";
import { ImageAssetsController } from "./image-assets.controller.js";
import type { ImageAssetsService } from "./image-assets.service.js";

describe("ImageAssetsController", () => {
  it("creates edit tasks for the authenticated user with request IP", async () => {
    const assets = createAssetsService();
    const sessions = createSessions();
    const controller = new ImageAssetsController(assets, sessions);

    await expect(
      controller.edit(createRequest({ "x-forwarded-for": "203.0.113.9, 10.0.0.2" }), "asset-1", {
        prompt: "make it brighter",
        maskId: "mask-version"
      })
    ).resolves.toEqual({ task: { id: "task-edit" } });

    expect(sessions.requireUser).toHaveBeenCalledWith("user-session-token");
    expect(assets.createEditTask).toHaveBeenCalledWith("user-1", "asset-1", {
      prompt: "make it brighter",
      maskId: "mask-version"
    }, "203.0.113.9");
  });

  it("creates variation tasks for the authenticated user with request IP", async () => {
    const assets = createAssetsService();
    const controller = new ImageAssetsController(assets, createSessions());

    await expect(
      controller.variation(createRequest({ "x-forwarded-for": "203.0.113.10" }), "asset-1")
    ).resolves.toEqual({ task: { id: "task-variation" } });

    expect(assets.createVariationTask).toHaveBeenCalledWith(
      "user-1",
      "asset-1",
      "203.0.113.10"
    );
  });

  it("creates upscale and background removal tasks for the authenticated user with request IP", async () => {
    const assets = createAssetsService();
    const controller = new ImageAssetsController(assets, createSessions());

    await expect(
      controller.upscale(createRequest({ "x-forwarded-for": "203.0.113.11" }), "asset-1")
    ).resolves.toEqual({ task: { id: "task-upscale" } });
    await expect(
      controller.removeBackground(createRequest({ "x-forwarded-for": "203.0.113.12" }), "asset-1")
    ).resolves.toEqual({ task: { id: "task-background" } });

    expect(assets.createUpscaleTask).toHaveBeenCalledWith(
      "user-1",
      "asset-1",
      "203.0.113.11"
    );
    expect(assets.createBackgroundRemovalTask).toHaveBeenCalledWith(
      "user-1",
      "asset-1",
      "203.0.113.12"
    );
  });

  it("creates expand tasks for the authenticated user with request IP", async () => {
    const assets = createAssetsService();
    const sessions = createSessions();
    const controller = new ImageAssetsController(assets, sessions);
    const body = {
      mode: "direction",
      direction: "right",
      percent: 0.25,
      padding: { left: 0, right: 256, top: 0, bottom: 0 },
      target: { width: 1280, height: 1024 }
    };

    await expect(
      controller.expand(
        createRequest({ "x-forwarded-for": " 203.0.113.13 , 10.0.0.2" }),
        "asset-1",
        body
      )
    ).resolves.toEqual({ task: { id: "task-expand" } });

    expect(sessions.requireUser).toHaveBeenCalledWith("user-session-token");
    expect(assets.createExpandTask).toHaveBeenCalledWith(
      "user-1",
      "asset-1",
      body,
      "203.0.113.13"
    );
  });

  it("uploads masks for the authenticated asset owner", async () => {
    const assets = createAssetsService();
    const controller = new ImageAssetsController(assets, createSessions());

    await expect(
      controller.uploadMask(createRequest(), "asset-1", {
        dataUrl: "data:image/png;base64,bWFzaw=="
      })
    ).resolves.toEqual({
      maskId: "mask-version",
      sizeBytes: 4
    });

    expect(assets.uploadMask).toHaveBeenCalledWith("user-1", "asset-1", {
      dataUrl: "data:image/png;base64,bWFzaw=="
    });
  });

  it("reverts assets and deletes assets for the authenticated user", async () => {
    const assets = createAssetsService();
    const controller = new ImageAssetsController(assets, createSessions());

    await expect(
      controller.revert(createRequest(), "asset-1", { versionId: "version-2" })
    ).resolves.toEqual({
      asset: { id: "asset-1", currentVersionId: "version-2" }
    });
    await expect(controller.remove(createRequest(), "asset-1")).resolves.toEqual({
      ok: true
    });

    expect(assets.revert).toHaveBeenCalledWith("user-1", "asset-1", {
      versionId: "version-2"
    });
    expect(assets.remove).toHaveBeenCalledWith("user-1", "asset-1");
  });

  it("returns signed download URLs without exposing storage keys", async () => {
    const assets = createAssetsService();
    const controller = new ImageAssetsController(assets, createSessions());

    await expect(controller.download(createRequest(), "asset-1")).resolves.toEqual({
      url: "https://mira.example/api/image-assets/preview?token=signed"
    });

    expect(assets.download).toHaveBeenCalledWith("user-1", "asset-1");
    expect(JSON.stringify(assets.download.mock.results)).not.toContain(
      "local/user/workspace"
    );
  });

  it("returns signed download URLs for historical versions", async () => {
    const assets = createAssetsService();
    const controller = new ImageAssetsController(
      assets,
      createSessions()
    ) as ImageAssetsController & {
      downloadVersion: (
        request: Request,
        assetId: string,
        versionId: string
      ) => Promise<{ url: string }>;
    };

    await expect(
      controller.downloadVersion(createRequest(), "asset-1", "version-2")
    ).resolves.toEqual({
      url: "https://mira.example/api/image-assets/preview?token=signed-version"
    });

    expect(assets.downloadVersion).toHaveBeenCalledWith(
      "user-1",
      "asset-1",
      "version-2"
    );
  });

  it("serves signed preview tokens without requiring a user session", async () => {
    const assets = createAssetsService();
    const controller = new ImageAssetsController(assets, createSessions());
    const response = {
      setHeader: jest.fn()
    };

    const stream = await controller.preview("signed-token", response as never);

    expect(stream).toBeInstanceOf(StreamableFile);
    expect(assets.preview).toHaveBeenCalledWith("signed-token");
    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, max-age=300"
    );
  });
});

function createRequest(headers: Request["headers"] = {}): Request {
  return {
    headers: {
      cookie: "mira_user_session=user-session-token",
      ...headers
    },
    ip: "198.51.100.7"
  } as unknown as Request;
}

function createSessions() {
  return {
    requireUser: jest.fn(() => Promise.resolve({ id: "user-1" }))
  } as unknown as jest.Mocked<UserSessionService>;
}

function createAssetsService() {
  return {
    createEditTask: jest.fn(() => Promise.resolve({ task: { id: "task-edit" } })),
    createVariationTask: jest.fn(() =>
      Promise.resolve({ task: { id: "task-variation" } })
    ),
    createUpscaleTask: jest.fn(() =>
      Promise.resolve({ task: { id: "task-upscale" } })
    ),
    createBackgroundRemovalTask: jest.fn(() =>
      Promise.resolve({ task: { id: "task-background" } })
    ),
    createExpandTask: jest.fn(() =>
      Promise.resolve({ task: { id: "task-expand" } })
    ),
    uploadMask: jest.fn(() =>
      Promise.resolve({
        maskId: "mask-version",
        sizeBytes: 4
      })
    ),
    revert: jest.fn(() =>
      Promise.resolve({
        asset: { id: "asset-1", currentVersionId: "version-2" }
      })
    ),
    download: jest.fn(() =>
      Promise.resolve({
        url: "https://mira.example/api/image-assets/preview?token=signed"
      })
    ),
    downloadVersion: jest.fn(() =>
      Promise.resolve({
        url: "https://mira.example/api/image-assets/preview?token=signed-version"
      })
    ),
    preview: jest.fn(() =>
      Promise.resolve({
        bytes: Buffer.from("png-bytes"),
        mimeType: "image/png"
      })
    ),
    remove: jest.fn(() => Promise.resolve({ ok: true }))
  } as unknown as jest.Mocked<ImageAssetsService>;
}
