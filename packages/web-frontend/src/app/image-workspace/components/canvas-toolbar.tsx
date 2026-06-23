"use client";

import { type ComponentType, useEffect, useState } from "react";
import {
  Frame,
  Hand,
  Maximize2,
  MousePointer2,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type { Editor } from "tldraw";

type CanvasToolbarProps = {
  editor: Editor | null;
};

type ToolbarButton = {
  active?: boolean;
  disabled?: boolean;
  icon: ComponentType<{ "aria-hidden": true; size: number }>;
  label: string;
  onClick: () => void;
};

export function CanvasToolbar({ editor }: CanvasToolbarProps) {
  const [, setRevision] = useState(0);

  useEffect(() => {
    if (!editor) return;
    return editor.store.listen(() => {
      setRevision((revision) => revision + 1);
    });
  }, [editor]);

  if (!editor) return null;

  const activeToolId = editor.getCurrentToolId();
  const canUndo = editor.getCanUndo();
  const canRedo = editor.getCanRedo();
  const buttons: ToolbarButton[] = [
    {
      active: activeToolId === "select",
      icon: MousePointer2,
      label: "选择",
      onClick: () => editor.setCurrentTool("select"),
    },
    {
      active: activeToolId === "hand",
      icon: Hand,
      label: "平移",
      onClick: () => editor.setCurrentTool("hand"),
    },
    {
      active: activeToolId === "frame",
      icon: Frame,
      label: "画框",
      onClick: () => editor.setCurrentTool("frame"),
    },
    {
      disabled: !canUndo,
      icon: Undo2,
      label: "撤销",
      onClick: () => editor.undo(),
    },
    {
      disabled: !canRedo,
      icon: Redo2,
      label: "重做",
      onClick: () => editor.redo(),
    },
    {
      icon: ZoomOut,
      label: "缩小",
      onClick: () => editor.zoomOut(),
    },
    {
      icon: ZoomIn,
      label: "放大",
      onClick: () => editor.zoomIn(),
    },
    {
      icon: Maximize2,
      label: "适配视图",
      onClick: () => fitCanvasToContent(editor),
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

function fitCanvasToContent(editor: Editor) {
  if (editor.getSelectedShapeIds().length > 0) {
    editor.zoomToSelection({ animation: { duration: 220 } });
    return;
  }

  const bounds = editor.getCurrentPageBounds();
  if (!bounds) return;
  editor.zoomToBounds(bounds, {
    animation: { duration: 220 },
    targetZoom: Math.min(1, editor.getZoomLevel()),
  });
}
