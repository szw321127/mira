import { Controller, Get, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { readUserSessionToken } from "../auth/auth-session.js";
import { UserSessionService } from "../auth/user-session.service.js";
import { encodeImageTaskEvent } from "./image-task-events.js";
import { ImageQueueService } from "./image-queue.service.js";
import { ImageWorkspacesService } from "./image-workspaces.service.js";

@Controller("image-workspaces")
export class ImageTaskStreamController {
  constructor(
    private readonly sessions: UserSessionService,
    private readonly workspaces: ImageWorkspacesService,
    private readonly queue: ImageQueueService
  ) {}

  @Get(":id/tasks/:taskId/stream")
  async stream(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("taskId") taskId: string,
    @Res() response: Response
  ) {
    const user = await this.sessions.requireUser(
      readUserSessionToken(request.headers.cookie)
    );
    await this.workspaces.assertTaskBelongsToWorkspace(user.id, id, taskId);

    response.status(200);
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");

    for (const event of await this.queue.listEvents(taskId)) {
      response.write(encodeImageTaskEvent(event));
    }

    const unsubscribe = await this.queue.subscribe(taskId, (event) => {
      response.write(encodeImageTaskEvent(event));
    });
    request.on("close", unsubscribe);
  }
}
