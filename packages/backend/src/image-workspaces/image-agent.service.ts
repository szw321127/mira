import { BadRequestException, Injectable } from "@nestjs/common";
import type { ImageTaskRequest } from "./image-workspaces.types.js";

@Injectable()
export class ImageAgentService {
  prepareTaskInput(request: ImageTaskRequest) {
    return {
      prompt: request.prompt.trim(),
      ...(request.target ? { target: request.target } : {}),
      ...(request.assetId ? { assetId: request.assetId } : {}),
      ...(request.versionId ? { versionId: request.versionId } : {}),
      ...(request.maskKey ? { maskKey: request.maskKey } : {}),
      ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
      ...(request.size ? { size: request.size } : {}),
      ...(request.quality ? { quality: request.quality } : {}),
      ...(request.background ? { background: request.background } : {})
    };
  }

  createRetryRequest(task: {
    type: ImageTaskRequest["type"];
    input: unknown;
  }): ImageTaskRequest {
    if (!isRecord(task.input) || typeof task.input.prompt !== "string") {
      throw new BadRequestException("Image task input cannot be retried.");
    }

    const prompt = task.input.prompt.trim();
    if (!prompt) throw new BadRequestException("Image task input cannot be retried.");

    const target =
      isRecord(task.input.target) &&
      typeof task.input.target.x === "number" &&
      typeof task.input.target.y === "number"
        ? { x: task.input.target.x, y: task.input.target.y }
        : null;

    return {
      type: task.type,
      prompt,
      ...(target ? { target } : {}),
      ...readOptionalString(task.input, "assetId"),
      ...readOptionalString(task.input, "versionId"),
      ...readOptionalString(task.input, "maskKey"),
      ...readOptionalString(task.input, "aspectRatio"),
      ...readOptionalString(task.input, "size"),
      ...readOptionalString(task.input, "quality"),
      ...readOptionalString(task.input, "background")
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(
  value: Record<string, unknown>,
  key:
    | "assetId"
    | "versionId"
    | "maskKey"
    | "aspectRatio"
    | "size"
    | "quality"
    | "background"
) {
  const raw = value[key];
  return typeof raw === "string" && raw.trim() ? { [key]: raw.trim() } : {};
}
