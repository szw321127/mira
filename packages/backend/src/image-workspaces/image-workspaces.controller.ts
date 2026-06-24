import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res
} from "@nestjs/common";
import type { Request, Response } from "express";
import { readUserSessionToken } from "../auth/auth-session.js";
import { UserSessionService } from "../auth/user-session.service.js";
import {
  type ImageSourceUploadRequest,
  ImageAssetsService
} from "./image-assets.service.js";
import { ImageWorkspacesService } from "./image-workspaces.service.js";
import {
  parseCanvasSnapshot,
  parseImageTaskRequest,
  parseWorkspaceTitle
} from "./image-workspaces.types.js";

@Controller("image-workspaces")
export class ImageWorkspacesController {
  constructor(
    private readonly workspaces: ImageWorkspacesService,
    private readonly sessions: UserSessionService,
    private readonly assets: ImageAssetsService
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const user = await this.requireUser(request);
    return this.workspaces.list(user.id);
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown) {
    const user = await this.requireUser(request);
    return this.workspaces.create(
      user.id,
      parseWorkspaceTitle(body) ?? "新图像画布"
    );
  }

  @Get(":id")
  async get(@Req() request: Request, @Param("id") id: string) {
    const user = await this.requireUser(request);
    return this.workspaces.get(user.id, id);
  }

  @Patch(":id/canvas")
  async updateCanvas(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() response: Response
  ) {
    const user = await this.requireUser(request);
    const snapshot = parseCanvasSnapshot(body);
    if (!snapshot) {
      return response
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: "Invalid image canvas snapshot." });
    }

    return response.json(await this.workspaces.updateCanvas(user.id, id, snapshot));
  }

  @Post(":id/tasks")
  async createTask(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() response: Response
  ) {
    const user = await this.requireUser(request);
    const parsed = parseImageTaskRequest(body);
    if (!parsed) {
      return response
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: "Invalid image task request." });
    }

    return response
      .status(HttpStatus.CREATED)
      .json(await this.workspaces.createTask(user.id, id, parsed, readRequestIp(request)));
  }

  @Post(":id/tasks/:taskId/cancel")
  async cancelTask(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("taskId") taskId: string
  ) {
    const user = await this.requireUser(request);
    return this.workspaces.cancelTask(user.id, id, taskId);
  }

  @Post(":id/tasks/:taskId/retry")
  async retryTask(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("taskId") taskId: string
  ) {
    const user = await this.requireUser(request);
    return this.workspaces.retryTask(user.id, id, taskId, readRequestIp(request));
  }

  @Delete(":id/tasks/:taskId")
  async deleteTask(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("taskId") taskId: string
  ) {
    const user = await this.requireUser(request);
    return this.workspaces.deleteTask(user.id, id, taskId);
  }

  @Post(":id/assets")
  async uploadSourceAsset(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: ImageSourceUploadRequest
  ) {
    const user = await this.requireUser(request);
    return this.assets.uploadSourceAsset(user.id, id, body);
  }

  @Patch(":id")
  async rename(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() response: Response
  ) {
    const user = await this.requireUser(request);
    const title = parseWorkspaceTitle(body);
    if (!title) {
      return response
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: "Invalid image workspace title." });
    }

    return response.json(await this.workspaces.rename(user.id, id, title));
  }

  @Delete(":id")
  async remove(@Req() request: Request, @Param("id") id: string) {
    const user = await this.requireUser(request);
    return this.workspaces.remove(user.id, id);
  }

  private async requireUser(request: Request) {
    return this.sessions.requireUser(readUserSessionToken(request.headers.cookie));
  }
}

function readRequestIp(request: Request): string | undefined {
  const forwarded = request.headers["x-forwarded-for"];
  const rawForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const forwardedIp = rawForwarded?.split(",")[0]?.trim();
  if (forwardedIp) return forwardedIp;

  return request.ip?.trim() || request.socket.remoteAddress?.trim() || undefined;
}
