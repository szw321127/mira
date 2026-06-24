"use client";

import { useMemo, useState } from "react";
import type { CanvasAssetSelection } from "./leafer-canvas-types";
import type { ImageAsset, ImageVersion, ImageWorkspace } from "./types";

const EMPTY_SELECTION: CanvasAssetSelection = {
  assetId: null,
  objectId: null,
  selectedVersionId: null,
};

export function useSelectedImageAsset(workspace: ImageWorkspace | null): {
  currentVersion: ImageVersion | null;
  previousVersion: ImageVersion | null;
  selectedAsset: ImageAsset | null;
  selectedAssetId: string | null;
  selectedObjectId: string | null;
  selectedVersionId: string | null;
  selectAsset: (selection: CanvasAssetSelection | string | null) => void;
  selectVersion: (versionId: string) => void;
} {
  const [selection, setSelection] =
    useState<CanvasAssetSelection>(EMPTY_SELECTION);

  const selectedAsset = useMemo(() => {
    return workspace?.assets.find((asset) => asset.id === selection.assetId) ?? null;
  }, [selection.assetId, workspace]);

  const selectedAssetId = selectedAsset ? selection.assetId : null;
  const selectedObjectId = selectedAsset ? selection.objectId : null;
  const requestedVersionId = selectedAsset ? selection.selectedVersionId : null;

  const currentVersion = useMemo(() => {
    if (!selectedAsset) return null;
    return (
      selectedAsset.versions.find((version) => version.id === requestedVersionId) ??
      selectedAsset.versions.find(
        (version) => version.id === selectedAsset.currentVersionId,
      ) ??
      selectedAsset.versions[0] ??
      null
    );
  }, [requestedVersionId, selectedAsset]);

  const previousVersion = useMemo(() => {
    if (!selectedAsset || !currentVersion) return null;
    return (
      selectedAsset.versions.find((version) => version.id !== currentVersion.id) ??
      null
    );
  }, [currentVersion, selectedAsset]);

  return {
    currentVersion,
    previousVersion,
    selectedAsset,
    selectedAssetId,
    selectedObjectId,
    selectedVersionId: currentVersion?.id ?? requestedVersionId,
    selectAsset,
    selectVersion,
  };

  function selectAsset(selection: CanvasAssetSelection | string | null) {
    if (!selection) {
      setSelection(EMPTY_SELECTION);
      return;
    }

    if (typeof selection === "string") {
      setSelection({
        assetId: selection,
        objectId: null,
        selectedVersionId: null,
      });
      return;
    }

    setSelection(selection);
  }

  function selectVersion(versionId: string) {
    setSelection((current) => ({
      ...current,
      selectedVersionId: versionId,
    }));
  }
}
