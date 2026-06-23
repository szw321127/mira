"use client";

import Link from "next/link";
import { ChevronLeft, PanelLeft, Sparkles } from "lucide-react";

export function MobileWorkspaceHeader({
  onOpenInspector,
  onOpenWorkspace,
  title,
}: {
  onOpenInspector: () => void;
  onOpenWorkspace: () => void;
  title: string;
}) {
  return (
    <header className="flex h-14 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2.5 md:hidden">
      <button
        aria-label="打开工作区"
        className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)]"
        onClick={onOpenWorkspace}
        type="button"
      >
        <PanelLeft aria-hidden="true" size={18} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-[700]">{title}</div>
        <div className="text-xs text-[var(--muted)]">Mira Image Workspace</div>
      </div>
      <button
        aria-label="打开生成面板"
        className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)]"
        onClick={onOpenInspector}
        type="button"
      >
        <Sparkles aria-hidden="true" size={18} />
      </button>
      <Link
        className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)]"
        href="/"
      >
        <ChevronLeft aria-hidden="true" size={18} />
        <span className="sr-only">返回对话</span>
      </Link>
    </header>
  );
}

export function MobileDrawerOverlay({
  label,
  onClose,
}: {
  label: string;
  onClose: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="fixed inset-0 z-30 bg-[oklch(0.14_0.012_260/0.42)] md:hidden"
      onClick={onClose}
      type="button"
    />
  );
}
