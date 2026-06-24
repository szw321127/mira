import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  ImageExpandDirection,
  ImageExpandMode,
  ImageExpandPadding,
  ImageExpandTarget,
  ImageTaskRequest
} from "./image-workspaces.types.js";

@Injectable()
export class ImageAgentService {
  prepareTaskInput(request: ImageTaskRequest) {
    if (request.type === "expand") {
      return {
        prompt: request.prompt.trim(),
        ...(request.assetId ? { assetId: request.assetId } : {}),
        ...(request.versionId ? { versionId: request.versionId } : {}),
        ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
        ...(request.mode ? { mode: request.mode } : {}),
        ...(request.direction ? { direction: request.direction } : {}),
        ...(request.percent !== undefined ? { percent: request.percent } : {}),
        ...(request.padding ? { padding: request.padding } : {}),
        ...(request.expandTarget ? { expandTarget: request.expandTarget } : {})
      };
    }

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

    if (task.type === "expand") {
      const mode = readExpandMode(task.input.mode);
      const direction = readExpandDirection(task.input.direction);
      const percent = readOptionalNumber(task.input.percent);
      const padding = readExpandPadding(task.input.padding);
      const expandTarget = readExpandTarget(task.input.expandTarget);
      if (!mode || !padding || !expandTarget || (mode === "direction" && !direction)) {
        throw new BadRequestException("Image task input cannot be retried.");
      }

      return {
        type: "expand",
        prompt,
        ...readOptionalString(task.input, "assetId"),
        ...readOptionalString(task.input, "versionId"),
        ...readOptionalString(task.input, "aspectRatio"),
        mode,
        ...(direction ? { direction } : {}),
        ...(percent !== null ? { percent } : {}),
        padding,
        expandTarget
      };
    }

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

function readExpandMode(value: unknown): ImageExpandMode | null {
  if (value === "free" || value === "ratio" || value === "direction") {
    return value;
  }
  return null;
}

function readExpandDirection(value: unknown): ImageExpandDirection | null {
  if (
    value === "left" ||
    value === "right" ||
    value === "top" ||
    value === "bottom" ||
    value === "around"
  ) {
    return value;
  }
  return null;
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1
    ? value
    : null;
}

function readExpandPadding(value: unknown): ImageExpandPadding | null {
  if (
    !isRecord(value) ||
    typeof value.left !== "number" ||
    typeof value.right !== "number" ||
    typeof value.top !== "number" ||
    typeof value.bottom !== "number"
  ) {
    return null;
  }
  if (
    !isNonNegativeInteger(value.left) ||
    !isNonNegativeInteger(value.right) ||
    !isNonNegativeInteger(value.top) ||
    !isNonNegativeInteger(value.bottom) ||
    value.left + value.right + value.top + value.bottom <= 0
  ) {
    return null;
  }
  return {
    left: value.left,
    right: value.right,
    top: value.top,
    bottom: value.bottom
  };
}

function readExpandTarget(value: unknown): ImageExpandTarget | null {
  if (
    !isRecord(value) ||
    typeof value.width !== "number" ||
    typeof value.height !== "number"
  ) {
    return null;
  }
  if (!isPositiveInteger(value.width) || !isPositiveInteger(value.height)) {
    return null;
  }
  return {
    width: value.width,
    height: value.height
  };
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
