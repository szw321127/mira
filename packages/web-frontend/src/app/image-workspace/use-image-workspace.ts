"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createImageAssetBackgroundRemovalTask,
  createImageAssetEditTask,
  createImageAssetUpscaleTask,
  createImageAssetVariationTask,
  createImageTask,
  createImageWorkspace,
  cancelImageTask,
  deleteImageAsset,
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
import { useImageTaskStream } from "./use-image-task-stream";
import type {
  CanvasSnapshot,
  ImageGenerationSettings,
  ImageTask,
  ImageTaskEvent,
  ImageWorkspace,
} from "./types";

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
    [activeWorkspace?.id, reloadWorkspace],
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
            tasks: [task, ...workspace.tasks],
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

  async function uploadSourceAsset(file: File) {
    if (!activeWorkspace || creatingTask) return;
    if (!isSupportedSourceImage(file)) {
      setError("请上传 PNG、JPEG 或 WebP 源图");
      return;
    }

    setCreatingTask(true);
    setError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const workspace = await uploadImageWorkspaceAsset(activeWorkspace.id, {
        dataUrl,
        title: file.name,
      });
      replaceWorkspace(workspace);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "源图上传失败");
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
    createImageBackgroundRemoval,
    revertAssetVersion,
    downloadAsset,
    removeImageAsset,
    cancelTask,
    retryTask,
    selectWorkspace: setActiveWorkspaceId,
  };

  function appendTask(workspaceId: string, task: ImageTask) {
    setWorkspaces((current) =>
      current.map((workspace) => {
        if (workspace.id !== workspaceId) return workspace;
        return {
          ...workspace,
          tasks: [task, ...workspace.tasks],
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
