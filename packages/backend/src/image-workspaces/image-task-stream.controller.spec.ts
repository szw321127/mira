import { jest } from "@jest/globals";
import type { Request, Response } from "express";
import type { UserSessionService } from "../auth/user-session.service.js";
import type { ImageWorkspacesService } from "./image-workspaces.service.js";
import { ImageTaskStreamController } from "./image-task-stream.controller.js";
import type { ImageQueueService } from "./image-queue.service.js";

describe("ImageTaskStreamController", () => {
  it("streams existing image task events as newline-delimited JSON", async () => {
    const response = createResponse();
    const queue = {
      listEvents: jest.fn(() =>
        Promise.resolve([
          {
            type: "task-progress",
            taskId: "task-1",
            status: "running",
            message: "正在生成图像"
          }
        ])
      ),
      subscribe: jest.fn(() => () => {})
    } as unknown as ImageQueueService;
    const workspaces = {
      get: jest.fn(() => Promise.resolve({ workspace: { id: "workspace-1" } })),
      assertTaskBelongsToWorkspace: jest.fn(() => Promise.resolve())
    } as unknown as jest.Mocked<ImageWorkspacesService>;
    const controller = new ImageTaskStreamController(
      {
        requireUser: jest.fn(() => Promise.resolve({ id: "user-1" }))
      } as unknown as UserSessionService,
      workspaces,
      queue
    );

    await controller.stream(
      { headers: { cookie: "session=abc" }, on: jest.fn() } as unknown as Request,
      "workspace-1",
      "task-1",
      response as unknown as Response
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/x-ndjson; charset=utf-8"
    );
    expect(response.write).toHaveBeenCalledWith(
      '{"type":"task-progress","taskId":"task-1","status":"running","message":"正在生成图像"}\n'
    );
    expect(workspaces.assertTaskBelongsToWorkspace).toHaveBeenCalledWith(
      "user-1",
      "workspace-1",
      "task-1"
    );
    expect(queue.subscribe).toHaveBeenCalledWith("task-1", expect.any(Function));
  });
});

function createResponse() {
  return {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    write: jest.fn(),
    end: jest.fn()
  };
}
