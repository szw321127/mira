import { jest } from "@jest/globals";
import type { Request, Response } from "express";
import type { UserSessionService } from "../auth/user-session.service.js";
import type { ImageAssetsService } from "./image-assets.service.js";
import { ImageWorkspacesController } from "./image-workspaces.controller.js";
import type { ImageWorkspacesService } from "./image-workspaces.service.js";

describe("ImageWorkspacesController", () => {
  it("passes the first forwarded request IP into image task creation", async () => {
    const workspaces = createWorkspacesService();
    const controller = new ImageWorkspacesController(
      workspaces,
      createSessions(),
      createAssetsService()
    );
    const response = createResponse();

    await controller.createTask(
      createRequest({ "x-forwarded-for": "203.0.113.9, 10.0.0.12" }),
      "workspace-1",
      {
        type: "generate",
        prompt: "make a cover"
      },
      response
    );

    expect(workspaces.createTask).toHaveBeenCalledWith(
      "user-1",
      "workspace-1",
      {
        type: "generate",
        prompt: "make a cover"
      },
      "203.0.113.9"
    );
  });

  it("cancels image tasks for the authenticated workspace owner", async () => {
    const workspaces = createWorkspacesService();
    const controller = new ImageWorkspacesController(
      workspaces,
      createSessions(),
      createAssetsService()
    ) as ImageWorkspacesController & {
      cancelTask: (
        request: Request,
        workspaceId: string,
        taskId: string
      ) => Promise<unknown>;
    };

    await expect(
      controller.cancelTask(createRequest(), "workspace-1", "task-1")
    ).resolves.toEqual({ task: { id: "task-1", status: "canceled" } });

    expect(workspaces.cancelTask).toHaveBeenCalledWith(
      "user-1",
      "workspace-1",
      "task-1"
    );
  });

  it("retries failed image tasks for the authenticated workspace owner", async () => {
    const workspaces = createWorkspacesService();
    const controller = new ImageWorkspacesController(
      workspaces,
      createSessions(),
      createAssetsService()
    ) as ImageWorkspacesController & {
      retryTask: (
        request: Request,
        workspaceId: string,
        taskId: string
      ) => Promise<unknown>;
    };

    await expect(
      controller.retryTask(createRequest({ "x-forwarded-for": "203.0.113.10" }), "workspace-1", "task-1")
    ).resolves.toEqual({ task: { id: "task-retry", status: "queued" } });

    expect(workspaces.retryTask).toHaveBeenCalledWith(
      "user-1",
      "workspace-1",
      "task-1",
      "203.0.113.10"
    );
  });

  it("uploads source image assets for the authenticated workspace owner", async () => {
    const assets = createAssetsService();
    const controller = new ImageWorkspacesController(
      createWorkspacesService(),
      createSessions(),
      assets
    ) as ImageWorkspacesController & {
      uploadSourceAsset: (
        request: Request,
        workspaceId: string,
        body: { dataUrl?: unknown; title?: unknown }
      ) => Promise<unknown>;
    };

    await expect(
      controller.uploadSourceAsset(createRequest(), "workspace-1", {
        dataUrl: "data:image/png;base64,aGVsbG8=",
        title: "source.png"
      })
    ).resolves.toEqual({ workspace: { id: "workspace-1" } });

    expect(assets.uploadSourceAsset).toHaveBeenCalledWith(
      "user-1",
      "workspace-1",
      {
        dataUrl: "data:image/png;base64,aGVsbG8=",
        title: "source.png"
      }
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

function createResponse(): Response {
  const response = {
    status: jest.fn(() => response),
    json: jest.fn(() => response)
  };
  return response as unknown as Response;
}

function createSessions() {
  return {
    requireUser: jest.fn(() => Promise.resolve({ id: "user-1" }))
  } as unknown as jest.Mocked<UserSessionService>;
}

function createWorkspacesService() {
  return {
    cancelTask: jest.fn(() =>
      Promise.resolve({ task: { id: "task-1", status: "canceled" } })
    ),
    createTask: jest.fn(() => Promise.resolve({ task: { id: "task-1" } })),
    retryTask: jest.fn(() =>
      Promise.resolve({ task: { id: "task-retry", status: "queued" } })
    )
  } as unknown as jest.Mocked<ImageWorkspacesService>;
}

function createAssetsService() {
  return {
    uploadSourceAsset: jest.fn(() =>
      Promise.resolve({ workspace: { id: "workspace-1" } })
    )
  } as unknown as jest.Mocked<ImageAssetsService>;
}
