"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { InspectorPanel } from "./components/inspector-panel";
import {
  MobileDrawerOverlay,
  MobileWorkspaceHeader,
} from "./components/mobile-drawers";
import { WorkspaceRail } from "./components/workspace-rail";
import { ImageCanvas } from "./image-canvas";
import type {
  CanvasAssetSelection,
  CanvasController,
  LocalEditOverlayState,
  LocalExpandDirection,
  LocalExpandMode,
  LocalExpandOverlayState,
  LocalExpandPadding,
} from "./leafer-canvas-types";
import type {
  ImageExpandRequest,
} from "./workspace-api";
import type {
  CanvasSnapshot,
  ImageGenerationSettings,
  ImageTask,
  ImageVersion,
  ImageWorkspace,
} from "./types";
import { useSelectedImageAsset } from "./use-selected-image-asset";

const EMPTY_LOCAL_EDIT_OVERLAY_STATE: LocalEditOverlayState = {
  assetId: null,
  brushSize: 34,
  dirty: false,
  markerRadius: 96,
  source: null,
};

const EMPTY_LOCAL_EXPAND_OVERLAY_STATE: LocalExpandOverlayState = {
  active: false,
  assetId: null,
  versionId: null,
  mode: "free",
  aspectRatio: "1:1",
  direction: "around",
  percent: 0.25,
  padding: { left: 0, right: 0, top: 0, bottom: 0 },
  target: null,
};

type ImageWorkspaceShellProps = {
  activeWorkspace: ImageWorkspace | null;
  creatingTask: boolean;
  error: string | null;
  loading: boolean;
  onCancelTask: (taskId: string) => Promise<void> | void;
  onCreate: () => void;
  onDeleteAsset: (assetId: string) => Promise<void> | void;
  onDeleteTask: (taskId: string) => Promise<void> | void;
  onDeleteWorkspace: (id: string) => Promise<void> | void;
  onDownloadAsset: (assetId: string, versionId?: string) => Promise<void> | void;
  onEditAsset: (
    assetId: string,
    prompt: string,
    maskId?: string,
  ) => Promise<void> | void;
  onExpandAsset: (assetId: string, input: ImageExpandRequest) => Promise<void> | void;
  onGenerate: (prompt: string, settings: ImageGenerationSettings) => void;
  onPersistCanvas: (snapshot: CanvasSnapshot) => Promise<void> | void;
  onRemoveBackgroundAsset: (assetId: string) => Promise<void> | void;
  onRenameWorkspace: (id: string, title: string) => Promise<void> | void;
  onRevertAsset: (assetId: string, versionId: string) => Promise<void> | void;
  onRetryTask: (taskId: string) => Promise<void> | void;
  onSelect: (id: string) => void;
  onUpscaleAsset: (assetId: string) => Promise<void> | void;
  onUploadMask: (
    assetId: string,
    dataUrl: string,
  ) => Promise<{ maskId: string; sizeBytes: number }>;
  onUploadSourceAsset: (file: File) => Promise<void> | void;
  onVariationAsset: (assetId: string) => Promise<void> | void;
  uploadedSourceSelection: CanvasAssetSelection | null;
  workspaces: ImageWorkspace[];
};

export function ImageWorkspaceShell({
  activeWorkspace,
  creatingTask,
  error,
  loading,
  onCancelTask,
  onCreate,
  onDeleteAsset,
  onDeleteTask,
  onDeleteWorkspace,
  onDownloadAsset,
  onEditAsset,
  onExpandAsset,
  onGenerate,
  onPersistCanvas,
  onRemoveBackgroundAsset,
  onRenameWorkspace,
  onRevertAsset,
  onRetryTask,
  onSelect,
  onUpscaleAsset,
  onUploadMask,
  onUploadSourceAsset,
  onVariationAsset,
  uploadedSourceSelection,
  workspaces,
}: ImageWorkspaceShellProps) {
  const canvasControllerRef = useRef<CanvasController | null>(null);
  const consumedUploadSelectionRef = useRef("");
  const [canvasController, setCanvasController] =
    useState<CanvasController | null>(null);
  const [localEditOverlayState, setLocalEditOverlayState] =
    useState<LocalEditOverlayState>(EMPTY_LOCAL_EDIT_OVERLAY_STATE);
  const [localExpandState, setLocalExpandState] =
    useState<LocalExpandOverlayState>(EMPTY_LOCAL_EXPAND_OVERLAY_STATE);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const {
    currentVersion,
    previousVersion,
    selectedAsset,
    selectedAssetId,
    selectedObjectId,
    selectedVersionId,
    selectAsset,
    selectVersion,
  } = useSelectedImageAsset(activeWorkspace);
  const activeTask =
    activeWorkspace?.tasks.find((task) => isActiveImageTask(task)) ?? null;

  useEffect(() => {
    const uploadSelectionKey = [
      uploadedSourceSelection?.assetId ?? "",
      uploadedSourceSelection?.objectId ?? "",
      uploadedSourceSelection?.selectedVersionId ?? "",
    ].join(":");
    if (
      !uploadedSourceSelection?.assetId ||
      !uploadedSourceSelection.objectId ||
      !uploadedSourceSelection.selectedVersionId ||
      !activeWorkspace ||
      consumedUploadSelectionRef.current === uploadSelectionKey
    ) {
      return;
    }

    const objectExists = activeWorkspace.objects.some((object) => {
      return (
        object.id === uploadedSourceSelection.objectId &&
        object.assetId === uploadedSourceSelection.assetId
      );
    });
    const versionExists = activeWorkspace.assets.some((asset) => {
      return (
        asset.id === uploadedSourceSelection.assetId &&
        asset.versions.some(
          (version) => version.id === uploadedSourceSelection.selectedVersionId,
        )
      );
    });
    if (!objectExists || !versionExists) return;

    selectAsset(uploadedSourceSelection);
    consumedUploadSelectionRef.current = uploadSelectionKey;
  }, [activeWorkspace, selectAsset, uploadedSourceSelection]);

  useEffect(() => {
    if (!canvasController) {
      return;
    }

    const syncOverlayState = () => {
      setLocalEditOverlayState(canvasController.getLocalEditOverlayState());
      setLocalExpandState(canvasController.getLocalExpandState());
    };
    syncOverlayState();
    return canvasController.subscribeChange(syncOverlayState);
  }, [canvasController]);

  const handleCanvasControllerReady = useCallback(
    (controller: CanvasController | null) => {
      canvasControllerRef.current = controller;
      setCanvasController(controller);
      if (!controller) {
        setLocalEditOverlayState(EMPTY_LOCAL_EDIT_OVERLAY_STATE);
        setLocalExpandState(EMPTY_LOCAL_EXPAND_OVERLAY_STATE);
      }
    },
    [],
  );

  const setLocalEditMarkerRadius = useCallback((radius: number) => {
    canvasControllerRef.current?.setLocalEditMarkerRadius(radius);
  }, []);

  const setLocalExpandMode = useCallback((mode: LocalExpandMode) => {
    canvasControllerRef.current?.setLocalExpandMode(mode);
  }, []);

  const setLocalExpandAspectRatio = useCallback(
    (aspectRatio: LocalExpandOverlayState["aspectRatio"]) => {
      canvasControllerRef.current?.setLocalExpandAspectRatio(aspectRatio);
    },
    [],
  );

  const setLocalExpandDirection = useCallback(
    (direction: LocalExpandDirection) => {
      canvasControllerRef.current?.setLocalExpandDirection(direction);
    },
    [],
  );

  const setLocalExpandPadding = useCallback(
    (padding: Partial<LocalExpandPadding>) => {
      canvasControllerRef.current?.setLocalExpandPadding(padding);
    },
    [],
  );

  const setLocalExpandPercent = useCallback((percent: number) => {
    canvasControllerRef.current?.setLocalExpandPercent(percent);
  }, []);

  const handleSelectVersion = useCallback(
    (versionId: string) => {
      canvasControllerRef.current?.setSelectedAssetVersion(versionId);
      selectVersion(versionId);
    },
    [selectVersion],
  );

  const submitLocalEdit = useCallback(
    async (assetId: string, version: ImageVersion, prompt: string) => {
      const controller = canvasControllerRef.current;
      if (!controller) {
        throw new Error("图像画布还在加载，请稍后再试");
      }

      const mask = controller.exportLocalEditMask({
        assetId,
        height: version.height,
        versionId: version.id,
        width: version.width,
      });
      if (!mask.dataUrl) {
        throw new Error("请先在画布中绘制蒙版或标记局部区域");
      }

      const { maskId } = await onUploadMask(assetId, mask.dataUrl);
      await onEditAsset(assetId, prompt, maskId);
      controller.clearLocalEditOverlay();
    },
    [onEditAsset, onUploadMask],
  );

  const submitExpand = useCallback(
    async (assetId: string, version: ImageVersion, prompt: string) => {
      const controller = canvasControllerRef.current;
      if (!controller) {
        throw new Error("图像画布还在加载，请稍后再试");
      }

      const expand = controller.exportLocalExpandInput({
        assetId,
        versionId: version.id,
        width: version.width,
        height: version.height,
      });
      if (!expand) {
        throw new Error("请先设置图片扩展范围");
      }

      await onExpandAsset(assetId, {
        ...expand,
        prompt: prompt.trim() || expand.promptDefaults,
      });
      controller.clearLocalExpandOverlay();
    },
    [onExpandAsset],
  );

  function selectWorkspace(id: string) {
    onSelect(id);
    setMobilePanelOpen(false);
  }

  return (
    <main className="grid h-full min-h-0 bg-[var(--background)] text-[var(--ink)] md:grid-cols-[260px_minmax(0,1fr)_320px]">
      <MobileWorkspaceHeader
        onOpenInspector={() => setMobileInspectorOpen(true)}
        onOpenWorkspace={() => setMobilePanelOpen(true)}
        title={activeWorkspace?.title ?? "图像画布"}
      />

      <WorkspaceRail
        activeWorkspaceId={activeWorkspace?.id ?? null}
        mobileOpen={mobilePanelOpen}
        onCreate={onCreate}
        onDelete={onDeleteWorkspace}
        onRename={onRenameWorkspace}
        onSelect={selectWorkspace}
        workspaces={workspaces}
      />

      {mobilePanelOpen ? (
        <MobileDrawerOverlay
          label="关闭工作区面板"
          onClose={() => setMobilePanelOpen(false)}
        />
      ) : null}

      <section className="min-h-0 border-r border-[var(--border)] max-md:h-[calc(100dvh-56px)]">
        <ImageCanvas
          loading={loading}
          onControllerReady={handleCanvasControllerReady}
          onPersistCanvas={onPersistCanvas}
          onSelectAsset={selectAsset}
          selectedAssetId={selectedAssetId}
          selectedObjectId={selectedObjectId}
          selectedVersionId={selectedVersionId}
          workspace={activeWorkspace}
        />
      </section>

      {mobileInspectorOpen ? (
        <MobileDrawerOverlay
          label="关闭生成面板"
          onClose={() => setMobileInspectorOpen(false)}
        />
      ) : null}

      <InspectorPanel
        activeWorkspace={activeWorkspace}
        activeTask={activeTask}
        creatingTask={creatingTask}
        currentVersion={currentVersion}
        error={error}
        mobileOpen={mobileInspectorOpen}
        onCloseMobile={() => setMobileInspectorOpen(false)}
        onCancelTask={onCancelTask}
        localEditOverlayState={localEditOverlayState}
        localExpandOverlayState={localExpandState}
        onDeleteAsset={onDeleteAsset}
        onDeleteTask={onDeleteTask}
        onDownloadAsset={onDownloadAsset}
        onGenerate={onGenerate}
        onLocalEditRadiusChange={setLocalEditMarkerRadius}
        onLocalExpandAspectRatioChange={setLocalExpandAspectRatio}
        onLocalExpandDirectionChange={setLocalExpandDirection}
        onLocalExpandModeChange={setLocalExpandMode}
        onLocalExpandPaddingChange={setLocalExpandPadding}
        onLocalExpandPercentChange={setLocalExpandPercent}
        onRemoveBackgroundAsset={onRemoveBackgroundAsset}
        onRevertAsset={onRevertAsset}
        onRetryTask={onRetryTask}
        onSelectAsset={selectAsset}
        onSelectVersion={handleSelectVersion}
        onSubmitExpand={submitExpand}
        onSubmitLocalEdit={submitLocalEdit}
        onUpscaleAsset={onUpscaleAsset}
        onUploadSourceAsset={onUploadSourceAsset}
        onVariationAsset={onVariationAsset}
        previousVersion={previousVersion}
        selectedAsset={selectedAsset}
      />
    </main>
  );
}

function isActiveImageTask(task: ImageTask) {
  return task.status === "queued" || task.status === "running";
}
