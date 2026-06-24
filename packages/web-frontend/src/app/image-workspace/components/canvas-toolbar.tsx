"use client";

import { type ComponentType, useEffect, useState } from "react";
import {
  Brush,
  Hand,
  MapPin,
  Maximize2,
  MousePointer2,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { CanvasController } from "../leafer-canvas-types";

type CanvasToolbarProps = {
  controller: CanvasController | null;
};

type ToolbarButton = {
  active?: boolean;
  disabled?: boolean;
  icon: ComponentType<{ "aria-hidden": true; size: number }>;
  label: string;
  onClick: () => void;
};

export function CanvasToolbar({ controller }: CanvasToolbarProps) {
  const [, setRevision] = useState(0);

  useEffect(() => {
    if (!controller) return;
    return controller.subscribeChange(() => {
      setRevision((revision) => revision + 1);
    });
  }, [controller]);

  if (!controller) return null;

  const activeTool = controller.getActiveTool();
  const buttons: ToolbarButton[] = [
    {
      active: activeTool === "select",
      icon: MousePointer2,
      label: "选择",
      onClick: () => controller.setTool("select"),
    },
    {
      active: activeTool === "pan",
      icon: Hand,
      label: "平移",
      onClick: () => controller.setTool("pan"),
    },
    {
      active: activeTool === "mask",
      icon: Brush,
      label: "蒙版",
      onClick: () => controller.setTool("mask"),
    },
    {
      active: activeTool === "marker",
      icon: MapPin,
      label: "标记局部",
      onClick: () => controller.setTool("marker"),
    },
    {
      disabled: !controller.getCanUndo(),
      icon: Undo2,
      label: "撤销",
      onClick: () => controller.undo(),
    },
    {
      disabled: !controller.getCanRedo(),
      icon: Redo2,
      label: "重做",
      onClick: () => controller.redo(),
    },
    {
      icon: ZoomOut,
      label: "缩小",
      onClick: () => controller.zoomOut(),
    },
    {
      icon: ZoomIn,
      label: "放大",
      onClick: () => controller.zoomIn(),
    },
    {
      icon: Maximize2,
      label: "适配视图",
      onClick: () => controller.fitView(),
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4 max-md:bottom-3">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-sm">
        {buttons.map((button) => {
          const Icon = button.icon;
          return (
            <button
              aria-label={button.label}
              aria-pressed={button.active}
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border text-[var(--muted-strong)] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                button.active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-muted)]"
              }`}
              disabled={button.disabled}
              key={button.label}
              onClick={button.onClick}
              title={button.label}
              type="button"
            >
              <Icon aria-hidden={true} size={16} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
