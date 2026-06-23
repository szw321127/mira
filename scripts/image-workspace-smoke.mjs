#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { extname, basename } from "node:path";

const APP_ORIGIN = readRequiredEnv("APP_ORIGIN").replace(/\/+$/, "");
const MIRA_USER_COOKIE = readRequiredEnv("MIRA_USER_COOKIE");
const SOURCE_IMAGE_PATH = readRequiredEnv("MIRA_SMOKE_SOURCE_IMAGE");
const MASK_IMAGE_PATH = process.env.MIRA_SMOKE_MASK_IMAGE || SOURCE_IMAGE_PATH;
const PROMPT =
  process.env.MIRA_SMOKE_PROMPT ||
  "A clean Mira product card with soft daylight, generous blank space, and no text.";
const TASK_TIMEOUT_MS = readIntegerEnv("MIRA_SMOKE_TASK_TIMEOUT_MS", 180_000);
const TASK_POLL_MS = readIntegerEnv("MIRA_SMOKE_TASK_POLL_MS", 2_000);
const IMAGE_WORKSPACES_ENDPOINT = "/api/image-workspaces";
const IMAGE_ASSETS_ENDPOINT = "/api/image-assets";
const WORKSPACE_TASKS_ENDPOINT = "/tasks";
const WORKSPACE_ASSETS_ENDPOINT = "/assets";
const ASSET_MASKS_ENDPOINT = "/masks";
const ASSET_EDIT_ENDPOINT = "/edit";
const ASSET_VARIATIONS_ENDPOINT = "/variations";
const ASSET_UPSCALE_ENDPOINT = "/upscale";
const ASSET_REMOVE_BACKGROUND_ENDPOINT = "/remove-background";
const ASSET_DOWNLOAD_ENDPOINT = "/download";
const ASSET_PREVIEW_ENDPOINT = "/preview";

const sourceDataUrl = await readImageDataUrl(SOURCE_IMAGE_PATH);
const maskDataUrl = await readImageDataUrl(MASK_IMAGE_PATH);

const workspace = await createWorkspace();
logStep("workspace", workspace.id);

const uploadedWorkspace = await uploadSourceAsset(workspace.id, {
  dataUrl: sourceDataUrl,
  filename: basename(SOURCE_IMAGE_PATH),
  title: "Mira smoke source"
});
const sourceAsset = newestAsset(uploadedWorkspace);
logStep("source-upload", sourceAsset.id);

await assertPreview(sourceAsset.id);
await assertDownload(sourceAsset.id);
logStep("source-preview-download", sourceAsset.id);

const generatedTask = await createGenerateTask(workspace.id);
const completedGenerate = await waitForTask(workspace.id, generatedTask.id);
const generatedWorkspace = await getWorkspace(workspace.id);
const generatedAsset = newestAsset(generatedWorkspace);
logStep("generate", `${completedGenerate.id}:${generatedAsset.id}`);

const mask = await uploadMask(generatedAsset.id, maskDataUrl);
logStep("mask-upload", `${generatedAsset.id}:${mask.sizeBytes}`);

const editTask = await createAssetTask(generatedAsset.id, ASSET_EDIT_ENDPOINT, {
  prompt: "Make the main subject brighter and keep the background clean.",
  maskId: mask.maskId
});
await waitForTask(workspace.id, editTask.id);
logStep("edit", editTask.id);

const variationTask = await createAssetTask(
  generatedAsset.id,
  ASSET_VARIATIONS_ENDPOINT
);
await waitForTask(workspace.id, variationTask.id);
logStep("variation", variationTask.id);

const upscaleTask = await createAssetTask(
  generatedAsset.id,
  ASSET_UPSCALE_ENDPOINT
);
await waitForTask(workspace.id, upscaleTask.id);
logStep("upscale", upscaleTask.id);

const backgroundTask = await createAssetTask(
  generatedAsset.id,
  ASSET_REMOVE_BACKGROUND_ENDPOINT
);
await waitForTask(workspace.id, backgroundTask.id);
logStep("background-removal", backgroundTask.id);

const finalWorkspace = await getWorkspace(workspace.id);
const finalAsset = newestAsset(finalWorkspace);
await assertPreview(finalAsset.id);
await assertDownload(finalAsset.id);

console.log(
  JSON.stringify(
    {
      ok: true,
      workspaceId: workspace.id,
      sourceAssetId: sourceAsset.id,
      finalAssetId: finalAsset.id,
      taskCount: finalWorkspace.tasks.length,
      assetCount: finalWorkspace.assets.length
    },
    null,
    2
  )
);

async function createWorkspace() {
  const payload = await apiJson(IMAGE_WORKSPACES_ENDPOINT, {
    method: "POST",
    body: { title: `Mira smoke ${new Date().toISOString()}` }
  });
  return requireObject(payload.workspace, "workspace");
}

async function getWorkspace(workspaceId) {
  const payload = await apiJson(
    `${IMAGE_WORKSPACES_ENDPOINT}/${encodeURIComponent(workspaceId)}`
  );
  return requireObject(payload.workspace, "workspace");
}

async function uploadSourceAsset(workspaceId, body) {
  const payload = await apiJson(
    `${IMAGE_WORKSPACES_ENDPOINT}/${encodeURIComponent(workspaceId)}${WORKSPACE_ASSETS_ENDPOINT}`,
    {
      method: "POST",
      body
    }
  );
  return requireObject(payload.workspace, "workspace");
}

async function createGenerateTask(workspaceId) {
  const payload = await apiJson(
    `${IMAGE_WORKSPACES_ENDPOINT}/${encodeURIComponent(workspaceId)}${WORKSPACE_TASKS_ENDPOINT}`,
    {
      method: "POST",
      body: {
        type: "generate",
        prompt: PROMPT,
        size: "1024x1024",
        quality: "low",
        background: "auto",
        target: { x: 80, y: 80 }
      }
    }
  );
  return requireObject(payload.task, "task");
}

async function uploadMask(assetId, dataUrl) {
  const payload = await apiJson(
    `${IMAGE_ASSETS_ENDPOINT}/${encodeURIComponent(assetId)}${ASSET_MASKS_ENDPOINT}`,
    {
      method: "POST",
      body: { dataUrl, filename: basename(MASK_IMAGE_PATH) }
    }
  );
  return requireObject(payload, "mask");
}

async function createAssetTask(assetId, endpoint, body = {}) {
  const payload = await apiJson(
    `${IMAGE_ASSETS_ENDPOINT}/${encodeURIComponent(assetId)}${endpoint}`,
    {
      method: "POST",
      body
    }
  );
  return requireObject(payload.task, "task");
}

async function waitForTask(workspaceId, taskId) {
  const deadline = Date.now() + TASK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const workspace = await getWorkspace(workspaceId);
    const task = workspace.tasks?.find((item) => item.id === taskId);
    if (task?.status === "complete") return task;
    if (task?.status === "failed" || task?.status === "canceled") {
      throw new Error(`Task ${taskId} ended as ${task.status}: ${task.error || ""}`);
    }
    await delay(TASK_POLL_MS);
  }
  throw new Error(`Timed out waiting for image task ${taskId}`);
}

async function assertPreview(assetId) {
  await assertOk(
    `${IMAGE_ASSETS_ENDPOINT}/${encodeURIComponent(assetId)}${ASSET_PREVIEW_ENDPOINT}`
  );
}

async function assertDownload(assetId) {
  const payload = await apiJson(
    `${IMAGE_ASSETS_ENDPOINT}/${encodeURIComponent(assetId)}${ASSET_DOWNLOAD_ENDPOINT}`
  );
  if (typeof payload.url !== "string" || !payload.url) {
    throw new Error(`Download response for ${assetId} did not include a URL`);
  }
  await assertOk(payload.url, { absolute: true });
}

async function assertOk(pathOrUrl, options = {}) {
  const response = await fetch(resolveUrl(pathOrUrl, options.absolute), {
    headers: { Cookie: MIRA_USER_COOKIE },
    redirect: "follow"
  });
  if (!response.ok) {
    throw new Error(`Expected ${pathOrUrl} to return 2xx, got ${response.status}`);
  }
  await response.arrayBuffer();
}

async function apiJson(path, options = {}) {
  const response = await fetch(resolveUrl(path), {
    method: options.method || "GET",
    headers: {
      Cookie: MIRA_USER_COOKIE,
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${options.method || "GET"} ${path} failed with ${response.status}: ${readMessage(payload)}`
    );
  }
  return payload;
}

function newestAsset(workspace) {
  const assets = Array.isArray(workspace.assets) ? workspace.assets : [];
  if (!assets.length) throw new Error(`Workspace ${workspace.id} has no image assets`);
  return [...assets].sort((left, right) => {
    return Date.parse(right.updatedAt || right.createdAt) -
      Date.parse(left.updatedAt || left.createdAt);
  })[0];
}

async function readImageDataUrl(filePath) {
  const bytes = await readFile(filePath);
  const mimeType = mimeTypeForPath(filePath);
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function mimeTypeForPath(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  throw new Error(`Unsupported smoke image extension: ${extension || "(none)"}`);
}

function resolveUrl(pathOrUrl, absolute = false) {
  if (absolute || /^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return `${APP_ORIGIN}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readIntegerEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requireObject(value, label) {
  if (!value || typeof value !== "object") {
    throw new Error(`Expected ${label} object in response`);
  }
  return value;
}

function readMessage(payload) {
  if (!payload || typeof payload !== "object") return "No response body";
  return payload.message || payload.error || JSON.stringify(payload);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logStep(step, value) {
  console.log(`${step}: ${value}`);
}
