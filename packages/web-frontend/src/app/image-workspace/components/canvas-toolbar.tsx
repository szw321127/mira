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
import type { CanvasTool } from "../leafer-canvas-types";

type CanvasToolbarProps = {
  controller: CanvasController | null;
};

type ToolbarButton = {
  disabled?: boolean;
  icon: ComponentType<{ "aria-hidden": true; size: number }>;
  label: string;
  onClick: () => void;
};

type ToolButton = {
  icon: ComponentType<{ "aria-hidden": true; size: number }>;
  label: string;
  tool: CanvasTool;
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
  const toolButtons: ToolButton[] = [
    {
      icon: MousePointer2,
      label: "选择",
      tool: "select",
    },
    {
      icon: Hand,
      label: "平移",
      tool: "pan",
    },
    {
      icon: Brush,
      label: "蒙版",
      tool: "mask",
    },
    {
      icon: MapPin,
      label: "标记局部",
      tool: "marker",
    },
  ];

  const actionButtons: ToolbarButton[] = [
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
  const activeToolButton =
    toolButtons.find((button) => button.tool === activeTool) ?? toolButtons[0];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4 max-md:bottom-3">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-sm">
        <div
          aria-live="polite"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-[7px] border border-[color-mix(in_oklch,var(--accent)_70%,var(--border))] bg-[var(--accent-subtle)] px-2 text-xs font-[700] whitespace-nowrap text-[var(--accent-strong)]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          <span>当前工具：{activeToolButton.label}</span>
        </div>
        {toolButtons.map((button) => {
          const Icon = button.icon;
          const active = activeTool === button.tool;
          return (
            <button
              aria-label={button.label}
              aria-pressed={active}
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border text-[var(--muted-strong)] transition-colors ${
                active
                  ? "border-[color-mix(in_oklch,var(--accent)_70%,var(--border))] bg-[var(--accent)] text-white ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface)] shadow-sm"
                  : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-muted)]"
              }`}
              data-active-tool={active}
              key={button.tool}
              onClick={() => controller.setTool(button.tool)}
              title={button.label}
              type="button"
            >
              <Icon aria-hidden={true} size={16} />
            </button>
          );
        })}
        <div className="mx-1 h-6 w-px shrink-0 bg-[var(--border)]" />
        {actionButtons.map((button) => {
          const Icon = button.icon;
          return (
            <button
              aria-label={button.label}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-transparent text-[var(--muted-strong)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-45"
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
