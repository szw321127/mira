"use client";

import { useEffect, useMemo, useState } from "react";
import type { ImageAsset, ImageVersion, ImageWorkspace } from "./types";

export function useSelectedImageAsset(workspace: ImageWorkspace | null): {
  currentVersion: ImageVersion | null;
  previousVersion: ImageVersion | null;
  selectedAsset: ImageAsset | null;
  selectedAssetId: string | null;
  selectAsset: (assetId: string | null) => void;
} {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace?.assets.length) {
      setSelectedAssetId(null);
      return;
    }
    if (selectedAssetId && !workspace.assets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(null);
    }
  }, [selectedAssetId, workspace]);

  const selectedAsset = useMemo(() => {
    return workspace?.assets.find((asset) => asset.id === selectedAssetId) ?? null;
  }, [selectedAssetId, workspace]);

  const currentVersion = useMemo(() => {
    if (!selectedAsset) return null;
    return (
      selectedAsset.versions.find(
        (version) => version.id === selectedAsset.currentVersionId,
      ) ??
      selectedAsset.versions[0] ??
      null
    );
  }, [selectedAsset]);

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
    selectAsset: setSelectedAssetId,
  };
}
