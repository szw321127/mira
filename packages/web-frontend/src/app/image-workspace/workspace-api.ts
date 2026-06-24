import type {
  ImageAsset,
  CanvasSnapshot,
  ImageGenerationSettings,
  ImageTask,
  ImageWorkspace
} from "./types";

type BackendMessage = {
  message?: string;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const value: unknown = await response.json().catch(() => ({}));
  return value as T;
}

async function assertOk(response: Response, fallback: string) {
  if (response.ok) return;

  const body = await readJson<BackendMessage>(response);
  throw new Error(body.message || body.error || fallback);
}

export async function loadImageWorkspaces() {
  const response = await fetch("/api/image-workspaces");
  await assertOk(response, "图像工作区加载失败");
  const data = await readJson<{ workspaces: ImageWorkspace[] }>(response);
  return data.workspaces;
}

export async function loadImageWorkspace(id: string) {
  const response = await fetch(`/api/image-workspaces/${encodeURIComponent(id)}`);
  await assertOk(response, "图像工作区加载失败");
  const data = await readJson<{ workspace: ImageWorkspace }>(response);
  return data.workspace;
}

export async function createImageWorkspace(title = "新图像画布") {
  const response = await fetch("/api/image-workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  await assertOk(response, "图像工作区创建失败");
  const data = await readJson<{ workspace: ImageWorkspace }>(response);
  return data.workspace;
}

export async function renameImageWorkspace(id: string, title: string) {
  const response = await fetch(`/api/image-workspaces/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  await assertOk(response, "图像工作区重命名失败");
  const data = await readJson<{ workspace: ImageWorkspace }>(response);
  return data.workspace;
}

export async function deleteImageWorkspace(id: string) {
  const response = await fetch(`/api/image-workspaces/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await assertOk(response, "图像工作区删除失败");
}

export async function saveCanvasSnapshot(id: string, snapshot: CanvasSnapshot) {
  const response = await fetch(
    `/api/image-workspaces/${encodeURIComponent(id)}/canvas`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    },
  );
  await assertOk(response, "画布保存失败");
  const data = await readJson<{ workspace: ImageWorkspace }>(response);
  return data.workspace;
}

export async function uploadImageWorkspaceAsset(
  workspaceId: string,
  input: { dataUrl: string; title?: string },
) {
  const response = await fetch(
    `/api/image-workspaces/${encodeURIComponent(workspaceId)}/assets`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  await assertOk(response, "源图上传失败");
  const data = await readJson<{ workspace: ImageWorkspace }>(response);
  return data.workspace;
}

export async function createImageTask(
  id: string,
  input: {
    type: ImageTask["type"];
    prompt: string;
    target?: { x: number; y: number };
    assetId?: string;
    versionId?: string;
    aspectRatio?: ImageGenerationSettings["aspectRatio"];
    quality?: ImageGenerationSettings["quality"];
    background?: ImageGenerationSettings["background"];
  },
) {
  const response = await fetch(
    `/api/image-workspaces/${encodeURIComponent(id)}/tasks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  await assertOk(response, "图像任务创建失败");
  const data = await readJson<{ task: ImageTask }>(response);
  return data.task;
}

export async function cancelImageTask(workspaceId: string, taskId: string) {
  const response = await fetch(
    `/api/image-workspaces/${encodeURIComponent(
      workspaceId,
    )}/tasks/${encodeURIComponent(taskId)}/cancel`,
    {
      method: "POST",
    },
  );
  await assertOk(response, "图像任务取消失败");
  const data = await readJson<{ task: ImageTask }>(response);
  return data.task;
}

export async function retryImageTask(workspaceId: string, taskId: string) {
  const response = await fetch(
    `/api/image-workspaces/${encodeURIComponent(
      workspaceId,
    )}/tasks/${encodeURIComponent(taskId)}/retry`,
    {
      method: "POST",
    },
  );
  await assertOk(response, "图像任务重试失败");
  const data = await readJson<{ task: ImageTask }>(response);
  return data.task;
}

export async function deleteImageTask(workspaceId: string, taskId: string) {
  const response = await fetch(
    `/api/image-workspaces/${encodeURIComponent(
      workspaceId,
    )}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "DELETE",
    },
  );
  await assertOk(response, "图像任务删除失败");
}

export async function createImageAssetEditTask(
  assetId: string,
  input: {
    prompt: string;
    maskId?: string;
  },
) {
  const response = await fetch(
    `/api/image-assets/${encodeURIComponent(assetId)}/edit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  await assertOk(response, "图片编辑任务创建失败");
  const data = await readJson<{ task: ImageTask }>(response);
  return data.task;
}

export async function uploadImageAssetMask(assetId: string, dataUrl: string) {
  const response = await fetch(
    `/api/image-assets/${encodeURIComponent(assetId)}/masks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
    },
  );
  await assertOk(response, "蒙版上传失败");
  return readJson<{ maskId: string; sizeBytes: number }>(response);
}

export async function createImageAssetVariationTask(assetId: string) {
  const response = await fetch(
    `/api/image-assets/${encodeURIComponent(assetId)}/variations`,
    {
      method: "POST",
    },
  );
  await assertOk(response, "图片变体任务创建失败");
  const data = await readJson<{ task: ImageTask }>(response);
  return data.task;
}

export async function createImageAssetUpscaleTask(assetId: string) {
  const response = await fetch(
    `/api/image-assets/${encodeURIComponent(assetId)}/upscale`,
    {
      method: "POST",
    },
  );
  await assertOk(response, "图片放大任务创建失败");
  const data = await readJson<{ task: ImageTask }>(response);
  return data.task;
}

export async function createImageAssetBackgroundRemovalTask(assetId: string) {
  const response = await fetch(
    `/api/image-assets/${encodeURIComponent(assetId)}/remove-background`,
    {
      method: "POST",
    },
  );
  await assertOk(response, "背景移除任务创建失败");
  const data = await readJson<{ task: ImageTask }>(response);
  return data.task;
}

export async function revertImageAsset(assetId: string, versionId: string) {
  const response = await fetch(
    `/api/image-assets/${encodeURIComponent(assetId)}/revert`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId }),
    },
  );
  await assertOk(response, "图片版本恢复失败");
  const data = await readJson<{ asset: ImageAsset }>(response);
  return data.asset;
}

export async function downloadImageAsset(assetId: string) {
  const response = await fetch(
    `/api/image-assets/${encodeURIComponent(assetId)}/download`,
  );
  await assertOk(response, "图片下载链接创建失败");
  return readJson<{ url: string }>(response);
}

export async function downloadImageAssetVersion(assetId: string, versionId: string) {
  const response = await fetch(createImageVersionDownloadUrl(assetId, versionId));
  await assertOk(response, "图片版本下载链接创建失败");
  return readJson<{ url: string }>(response);
}

export function createImageAssetPreviewUrl(assetId: string) {
  return `/api/image-assets/${encodeURIComponent(assetId)}/preview`;
}

export function createImageVersionPreviewUrl(assetId: string, versionId: string) {
  return `/api/image-assets/${encodeURIComponent(assetId)}/versions/${encodeURIComponent(
    versionId,
  )}/preview`;
}

export function createImageVersionDownloadUrl(assetId: string, versionId: string) {
  return `/api/image-assets/${encodeURIComponent(assetId)}/versions/${encodeURIComponent(
    versionId,
  )}/download`;
}

export async function deleteImageAsset(assetId: string) {
  const response = await fetch(
    `/api/image-assets/${encodeURIComponent(assetId)}`,
    {
      method: "DELETE",
    },
  );
  await assertOk(response, "图片删除失败");
}

export function createImageTaskStreamUrl(workspaceId: string, taskId: string) {
  return `/api/image-workspaces/${encodeURIComponent(
    workspaceId,
  )}/tasks/${encodeURIComponent(taskId)}/stream`;
}
