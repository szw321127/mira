import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile
} from "@nestjs/common";
import type { Request, Response } from "express";
import { readUserSessionToken } from "../auth/auth-session.js";
import { UserSessionService } from "../auth/user-session.service.js";
import {
  type ImageAssetMaskUploadRequest,
  type ImageAssetEditRequest,
  type ImageAssetRevertRequest,
  ImageAssetsService
} from "./image-assets.service.js";

@Controller("image-assets")
export class ImageAssetsController {
  constructor(
    private readonly assets: ImageAssetsService,
    private readonly sessions: UserSessionService
  ) {}

  @Get("preview")
  async preview(
    @Query("token") token: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const preview = await this.assets.preview(token);
    response.setHeader("Content-Type", preview.mimeType);
    response.setHeader("Cache-Control", "private, max-age=300");
    return new StreamableFile(preview.bytes);
  }

  @Post(":assetId/edit")
  async edit(
    @Req() request: Request,
    @Param("assetId") assetId: string,
    @Body() body: ImageAssetEditRequest
  ) {
    const user = await this.requireUser(request);
    return this.assets.createEditTask(
      user.id,
      assetId,
      body,
      readRequestIp(request)
    );
  }

  @Post(":assetId/variations")
  async variation(@Req() request: Request, @Param("assetId") assetId: string) {
    const user = await this.requireUser(request);
    return this.assets.createVariationTask(user.id, assetId, readRequestIp(request));
  }

  @Post(":assetId/upscale")
  async upscale(@Req() request: Request, @Param("assetId") assetId: string) {
    const user = await this.requireUser(request);
    return this.assets.createUpscaleTask(user.id, assetId, readRequestIp(request));
  }

  @Post(":assetId/remove-background")
  async removeBackground(
    @Req() request: Request,
    @Param("assetId") assetId: string
  ) {
    const user = await this.requireUser(request);
    return this.assets.createBackgroundRemovalTask(
      user.id,
      assetId,
      readRequestIp(request)
    );
  }

  @Post(":assetId/masks")
  async uploadMask(
    @Req() request: Request,
    @Param("assetId") assetId: string,
    @Body() body: ImageAssetMaskUploadRequest
  ) {
    const user = await this.requireUser(request);
    return this.assets.uploadMask(user.id, assetId, body);
  }

  @Post(":assetId/revert")
  async revert(
    @Req() request: Request,
    @Param("assetId") assetId: string,
    @Body() body: ImageAssetRevertRequest
  ) {
    const user = await this.requireUser(request);
    return this.assets.revert(user.id, assetId, body);
  }

  @Get(":assetId/download")
  async download(@Req() request: Request, @Param("assetId") assetId: string) {
    const user = await this.requireUser(request);
    return this.assets.download(user.id, assetId);
  }

  @Get(":assetId/versions/:versionId/download")
  async downloadVersion(
    @Req() request: Request,
    @Param("assetId") assetId: string,
    @Param("versionId") versionId: string
  ) {
    const user = await this.requireUser(request);
    return this.assets.downloadVersion(user.id, assetId, versionId);
  }

  @Delete(":assetId")
  async remove(@Req() request: Request, @Param("assetId") assetId: string) {
    const user = await this.requireUser(request);
    return this.assets.remove(user.id, assetId);
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
