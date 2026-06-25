"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createImageAssetBackgroundRemovalTask,
  createImageAssetEditTask,
  createImageAssetExpandTask,
  createImageAssetUpscaleTask,
  createImageAssetVariationTask,
  createImageTask,
  createImageWorkspace,
  cancelImageTask,
  deleteImageAsset,
  deleteImageTask,
  deleteImageWorkspace,
  downloadImageAsset,
  downloadImageAssetVersion,
  loadImageWorkspace,
  loadImageWorkspaces,
  renameImageWorkspace,
  revertImageAsset,
  retryImageTask,
  saveCanvasSnapshot,
  uploadImageAssetMask,
  uploadImageWorkspaceAsset
} from "./workspace-api";
import type { ImageExpandRequest } from "./workspace-api";
import { useImageTaskStream } from "./use-image-task-stream";
import type {
  CanvasSnapshot,
  ImageAsset,
  ImageGenerationSettings,
  ImageTask,
  ImageTaskEvent,
  ImageWorkspace,
} from "./types";
import type { CanvasAssetSelection } from "./leafer-canvas-types";

const IMAGE_TASK_HISTORY_LIMIT = 20;

export type ImageSourceUploadResult = {
  selection: CanvasAssetSelection | null;
  workspace: ImageWorkspace;
};

export function useImageWorkspace() {
  const [workspaces, setWorkspaces] = useState<ImageWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [streamTaskId, setStreamTaskId] = useState<string | null>(null);

  const activeWorkspace = useMemo(() => {
    return (
      workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
      workspaces[0] ??
      null
    );
  }, [activeWorkspaceId, workspaces]);

  const replaceWorkspace = useCallback((workspace: ImageWorkspace) => {
    setWorkspaces((current) => {
      const exists = current.some((item) => item.id === workspace.id);
      const next = exists
        ? current.map((item) => (item.id === workspace.id ? workspace : item))
        : [workspace, ...current];
      return next.sort((left, right) => {
        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      });
    });
    setActiveWorkspaceId(workspace.id);
  }, []);

  const reloadWorkspace = useCallback(
    async (workspaceId: string) => {
      replaceWorkspace(await loadImageWorkspace(workspaceId));
    },
    [replaceWorkspace],
  );

  const handleTaskEvent = useCallback(
    (event: ImageTaskEvent) => {
      if (event.type === "task-progress") {
        setWorkspaces((current) =>
          updateWorkspaceTask(current, event.taskId, (task) => ({
            ...task,
            status: event.status,
          })),
        );
        if (
          event.status === "complete" ||
          event.status === "failed" ||
          event.status === "canceled"
        ) {
          setStreamTaskId(null);
        }
        return;
      }

      if (event.type === "canvas-updated") {
        void reloadWorkspace(event.workspaceId).catch((reloadError) => {
          setError(
            reloadError instanceof Error ? reloadError.message : "图像工作区刷新失败",
          );
        });
        return;
      }

      if (
        event.type === "asset-created" ||
        event.type === "asset-updated" ||
        event.type === "asset-version-created"
      ) {
        if (activeWorkspace?.id) {
          void reloadWorkspace(activeWorkspace.id).catch((reloadError) => {
            setError(
              reloadError instanceof Error ? reloadError.message : "图像工作区刷新失败",
            );
          });
        }
        return;
      }

      if (event.type === "usage") {
        setWorkspaces((current) =>
          updateWorkspaceTask(current, event.taskId, (task) => ({
            ...task,
            cost: {
              provider: event.provider,
              ...(event.cost ? { estimatedCostUsd: event.cost } : {}),
            },
          })),
        );
        return;
      }

      if (event.type === "task-created" || event.type === "asset-placeholder") {
        return;
      }

      const message = event.message;
      setError(message);
      setWorkspaces((current) =>
        updateWorkspaceTask(current, event.taskId, (task) => ({
          ...task,
          status: "failed",
          error: message,
        })),
      );
      setStreamTaskId(null);
    },
    [activeWorkspace, reloadWorkspace],
  );

  const handleStreamError = useCallback((message: string) => {
    setError(message);
    setStreamTaskId(null);
  }, []);

  useImageTaskStream({
    workspaceId: activeWorkspace?.id ?? null,
    taskId: streamTaskId,
    onEvent: handleTaskEvent,
    onError: handleStreamError,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const loaded = await loadImageWorkspaces();
        if (cancelled) return;
        if (loaded.length > 0) {
          setWorkspaces(loaded);
          setActiveWorkspaceId(loaded[0].id);
          return;
        }

        const created = await createImageWorkspace();
        if (cancelled) return;
        setWorkspaces([created]);
        setActiveWorkspaceId(created.id);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "图像工作区加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createWorkspace() {
    const workspace = await createImageWorkspace();
    replaceWorkspace(workspace);
  }

  async function renameWorkspace(id: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    replaceWorkspace(await renameImageWorkspace(id, trimmed));
  }

  async function deleteWorkspace(id: string) {
    await deleteImageWorkspace(id);
    setWorkspaces((current) => current.filter((workspace) => workspace.id !== id));
    setActiveWorkspaceId((current) => (current === id ? null : current));
  }

  async function persistCanvas(snapshot: CanvasSnapshot) {
    if (!activeWorkspace) return;
    if (!shouldPersistCanvasSnapshot(activeWorkspace, snapshot)) return;

    setError(null);
    try {
      replaceWorkspace(await saveCanvasSnapshot(activeWorkspace.id, snapshot));
    } catch (canvasError) {
      setError(canvasError instanceof Error ? canvasError.message : "画布保存失败");
    }
  }

  async function generateImage(prompt: string, settings: ImageGenerationSettings) {
    if (!activeWorkspace || creatingTask) return;
    const trimmed = prompt.trim();
    if (!trimmed) return;

    setCreatingTask(true);
    setError(null);
    try {
      const task = await createImageTask(activeWorkspace.id, {
        type: "generate",
        prompt: trimmed,
        target: { x: 160, y: 160 },
        ...settings,
      });
      setWorkspaces((current) =>
        current.map((workspace) => {
          if (workspace.id !== activeWorkspace.id) return workspace;
          return {
            ...workspace,
            tasks: limitImageTasks([task, ...workspace.tasks]),
          };
        }),
      );
      setStreamTaskId(task.id);
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "图像任务创建失败");
    } finally {
      setCreatingTask(false);
    }
  }

  async function editImageAsset(assetId: string, prompt: string, maskId?: string) {
    if (!activeWorkspace || creatingTask) return;
    const trimmed = prompt.trim();
    if (!trimmed) return;

    setCreatingTask(true);
    setError(null);
    try {
      const task = await createImageAssetEditTask(assetId, {
        prompt: trimmed,
        ...(maskId?.trim() ? { maskId: maskId.trim() } : {}),
      });
      appendTask(activeWorkspace.id, task);
      setStreamTaskId(task.id);
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "图片编辑任务创建失败");
    } finally {
      setCreatingTask(false);
    }
  }

  async function uploadAssetMask(assetId: string, dataUrl: string) {
    setError(null);
    try {
      return await uploadImageAssetMask(assetId, dataUrl);
    } catch (uploadError) {
      const message =
        uploadError instanceof Error ? uploadError.message : "蒙版上传失败";
      setError(message);
      throw new Error(message);
    }
  }

  async function uploadSourceAsset(file: File): Promise<ImageSourceUploadResult | null> {
    if (!activeWorkspace || creatingTask) return null;
    if (!isSupportedSourceImage(file)) {
      setError("请上传 PNG、JPEG 或 WebP 源图");
      return null;
    }

    setCreatingTask(true);
    setError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      assertSourceDataUrl(dataUrl, file);
      const workspace = await uploadImageWorkspaceAsset(activeWorkspace.id, {
        dataUrl,
        title: file.name,
      });
      replaceWorkspace(workspace);
      return {
        workspace,
        selection: findUploadedSourceSelection(activeWorkspace, workspace),
      };
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "源图上传失败");
      return null;
    } finally {
      setCreatingTask(false);
    }
  }

  async function createImageVariation(assetId: string) {
    if (!activeWorkspace || creatingTask) return;

    setCreatingTask(true);
    setError(null);
    try {
      const task = await createImageAssetVariationTask(assetId);
      appendTask(activeWorkspace.id, task);
      setStreamTaskId(task.id);
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "图片变体任务创建失败");
    } finally {
      setCreatingTask(false);
    }
  }

  async function createImageUpscale(assetId: string) {
    if (!activeWorkspace || creatingTask) return;

    setCreatingTask(true);
    setError(null);
    try {
      const task = await createImageAssetUpscaleTask(assetId);
      appendTask(activeWorkspace.id, task);
      setStreamTaskId(task.id);
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "图片放大任务创建失败");
    } finally {
      setCreatingTask(false);
    }
  }

  async function expandImageAsset(assetId: string, input: ImageExpandRequest) {
    if (!activeWorkspace || creatingTask) return;

    setCreatingTask(true);
    setError(null);
    try {
      const task = await createImageAssetExpandTask(assetId, input);
      appendTask(activeWorkspace.id, task);
      setStreamTaskId(task.id);
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "图片扩展任务创建失败");
      throw taskError;
    } finally {
      setCreatingTask(false);
    }
  }

  async function createImageBackgroundRemoval(assetId: string) {
    if (!activeWorkspace || creatingTask) return;

    setCreatingTask(true);
    setError(null);
    try {
      const task = await createImageAssetBackgroundRemovalTask(assetId);
      appendTask(activeWorkspace.id, task);
      setStreamTaskId(task.id);
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "背景移除任务创建失败");
    } finally {
      setCreatingTask(false);
    }
  }

  async function revertAssetVersion(assetId: string, versionId: string) {
    if (!activeWorkspace) return;
    setError(null);
    try {
      await revertImageAsset(assetId, versionId);
      await reloadWorkspace(activeWorkspace.id);
    } catch (revertError) {
      setError(revertError instanceof Error ? revertError.message : "图片版本恢复失败");
    }
  }

  async function downloadAsset(assetId: string, versionId?: string) {
    setError(null);
    try {
      const { url } = versionId
        ? await downloadImageAssetVersion(assetId, versionId)
        : await downloadImageAsset(assetId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (downloadError) {
      setError(
        downloadError instanceof Error ? downloadError.message : "图片下载链接创建失败",
      );
    }
  }

  async function removeImageAsset(assetId: string) {
    if (!activeWorkspace) return;
    setError(null);
    try {
      await deleteImageAsset(assetId);
      await reloadWorkspace(activeWorkspace.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "图片删除失败");
    }
  }

  async function cancelTask(taskId: string) {
    if (!activeWorkspace) return;
    setError(null);
    try {
      const canceledTask = await cancelImageTask(activeWorkspace.id, taskId);
      setWorkspaces((current) =>
        updateWorkspaceTask(current, taskId, (task) => ({
          ...task,
          ...canceledTask,
          status: "canceled",
        })),
      );
      setStreamTaskId((current) => (current === taskId ? null : current));
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "图像任务取消失败");
    }
  }

  async function retryTask(taskId: string) {
    if (!activeWorkspace || creatingTask) return;
    setCreatingTask(true);
    setError(null);
    try {
      const retriedTask = await retryImageTask(activeWorkspace.id, taskId);
      appendTask(activeWorkspace.id, retriedTask);
      setStreamTaskId(retriedTask.id);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "图像任务重试失败");
    } finally {
      setCreatingTask(false);
    }
  }

  async function deleteTask(taskId: string) {
    if (!activeWorkspace) return;
    setError(null);
    try {
      await deleteImageTask(activeWorkspace.id, taskId);
      setWorkspaces((current) =>
        current.map((workspace) => {
          if (workspace.id !== activeWorkspace.id) return workspace;
          return {
            ...workspace,
            tasks: workspace.tasks.filter((task) => task.id !== taskId),
          };
        }),
      );
      setStreamTaskId((current) => (current === taskId ? null : current));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "图像任务删除失败");
    }
  }

  return {
    activeWorkspace,
    workspaces,
    loading,
    error,
    creatingTask,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    persistCanvas,
    generateImage,
    editImageAsset,
    uploadSourceAsset,
    uploadAssetMask,
    createImageVariation,
    createImageUpscale,
    expandImageAsset,
    createImageBackgroundRemoval,
    revertAssetVersion,
    downloadAsset,
    removeImageAsset,
    cancelTask,
    deleteTask,
    retryTask,
    selectWorkspace: setActiveWorkspaceId,
  };

  function appendTask(workspaceId: string, task: ImageTask) {
    setWorkspaces((current) =>
      current.map((workspace) => {
        if (workspace.id !== workspaceId) return workspace;
        return {
          ...workspace,
          tasks: limitImageTasks([task, ...workspace.tasks]),
        };
      }),
    );
  }
}

function isSupportedSourceImage(file: File) {
  return file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp";
}

function shouldPersistCanvasSnapshot(
  activeWorkspace: ImageWorkspace,
  snapshot: CanvasSnapshot,
) {
  return !(
    activeWorkspace.objects.length > 0 && snapshot.objects.length === 0
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("源图读取失败"));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("源图读取失败"));
    };
    reader.readAsDataURL(file);
  });
}

function assertSourceDataUrl(dataUrl: string, file: File) {
  if (!dataUrl.startsWith(`data:${file.type};base64,`)) {
    throw new Error("源图读取结果无效，请重新选择图片");
  }
}

function findUploadedSourceSelection(
  previousWorkspace: ImageWorkspace,
  nextWorkspace: ImageWorkspace,
): CanvasAssetSelection | null {
  const previousAssetIds = new Set(previousWorkspace.assets.map((asset) => asset.id));
  const previousObjectIds = new Set(
    previousWorkspace.objects.map((object) => object.id),
  );
  const uploadedAsset = nextWorkspace.assets.find((asset) => {
    return !previousAssetIds.has(asset.id) && isSourceUploadAsset(asset);
  });
  const uploadedObject = uploadedAsset
    ? nextWorkspace.objects.find((object) => {
        return (
          object.assetId === uploadedAsset.id &&
          !previousObjectIds.has(object.id) &&
          object.props?.source === "upload"
        );
      })
    : null;
  const uploadedVersion = uploadedAsset
    ? uploadedAsset.versions.find(
        (version) => version.id === uploadedAsset.currentVersionId,
      ) ?? uploadedAsset.versions[0] ?? null
    : null;

  if (!uploadedAsset || !uploadedObject || !uploadedVersion) return null;
  return {
    assetId: uploadedAsset.id,
    objectId: uploadedObject.id,
    selectedVersionId: uploadedVersion.id,
  };
}

function isSourceUploadAsset(asset: ImageAsset) {
  return asset.metadata.kind === "source_upload";
}

function updateWorkspaceTask(
  workspaces: ImageWorkspace[],
  taskId: string,
  updateTask: (task: ImageTask) => ImageTask,
) {
  return workspaces.map((workspace) => ({
    ...workspace,
    tasks: workspace.tasks.map((task) =>
      task.id === taskId ? updateTask(task) : task,
    ),
  }));
}

function limitImageTasks(tasks: ImageTask[]) {
  return tasks.slice(0, IMAGE_TASK_HISTORY_LIMIT);
}
