"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Check,
  Image as ImageIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCircle,
  X,
} from "lucide-react";
import type { ImageWorkspace } from "../types";

export function WorkspaceRail({
  activeWorkspaceId,
  mobileOpen,
  onCreate,
  onDelete,
  onRename,
  onSelect,
  workspaces,
}: {
  activeWorkspaceId: string | null;
  mobileOpen: boolean;
  onCreate: () => void;
  onDelete: (id: string) => Promise<void> | void;
  onRename: (id: string, title: string) => Promise<void> | void;
  onSelect: (id: string) => void;
  workspaces: ImageWorkspace[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredWorkspaces = useMemo(() => {
    if (!normalizedSearchQuery) return workspaces;
    return workspaces.filter((workspace) =>
      workspace.title.toLowerCase().includes(normalizedSearchQuery),
    );
  }, [normalizedSearchQuery, workspaces]);

  function startRename(workspace: ImageWorkspace) {
    setEditingWorkspaceId(workspace.id);
    setEditingTitle(workspace.title);
  }

  function cancelRename() {
    setEditingWorkspaceId(null);
    setEditingTitle("");
  }

  async function submitRename(workspace: ImageWorkspace) {
    const trimmed = editingTitle.trim();
    if (!trimmed || trimmed === workspace.title) return;
    await onRename(workspace.id, trimmed);
    cancelRename();
  }

  async function deleteWorkspace(workspace: ImageWorkspace) {
    const confirmed = window.confirm(`确认删除「${workspace.title}」吗？`);
    if (!confirmed) return;
    await onDelete(workspace.id);
  }

  return (
    <aside
      className={`border-r border-[var(--border)] bg-[var(--surface)] ${
        mobileOpen
          ? "fixed inset-y-0 left-0 z-40 w-[min(300px,calc(100vw-56px))]"
          : "hidden"
      } md:static md:block md:w-auto`}
    >
      <div className="flex h-[var(--workspace-header-height)] items-center justify-between border-b border-[var(--border)] px-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-[700]">
            <ImageIcon aria-hidden="true" size={17} />
            工作区
          </div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            {filteredWorkspaces.length} / {workspaces.length} 个图像画布
          </div>
        </div>
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] transition-colors hover:bg-[var(--surface-muted)]"
          onClick={onCreate}
          type="button"
        >
          <Plus aria-hidden="true" size={16} />
          <span className="sr-only">新建图像工作区</span>
        </button>
      </div>
      <div className="border-b border-[var(--border)] p-2">
        <Link
          className="flex h-9 items-center gap-2 rounded-[8px] px-2 text-sm font-[650] text-[var(--muted-strong)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
          href="/account"
        >
          <UserCircle aria-hidden="true" size={16} />
          用户信息
        </Link>
      </div>
      <div className="border-b border-[var(--border)] p-2">
        <label className="relative block">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            size={15}
          />
          <input
            className="h-9 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--ink)] placeholder:text-[var(--muted-strong)] focus:border-[var(--accent)] focus:outline-none focus-visible:outline-none"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索图像画布"
            type="search"
            value={searchQuery}
          />
        </label>
      </div>
      <div className="space-y-1 p-2">
        {filteredWorkspaces.map((workspace) => (
          <div
            className={`min-h-11 w-full rounded-[8px] px-3 text-left transition-colors ${
              workspace.id === activeWorkspaceId
                ? "bg-[var(--accent-subtle)] text-[var(--accent-strong)]"
                : "text-[var(--ink)] hover:bg-[var(--surface-muted)]"
            }`}
            key={workspace.id}
          >
            <div className="flex items-start gap-2 py-2">
              {editingWorkspaceId === workspace.id ? (
                <form
                  className="min-w-0 flex-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitRename(workspace);
                  }}
                >
                  <input
                    autoFocus
                    className="h-8 w-full rounded-[8px] border border-[var(--accent)] bg-[var(--surface)] px-2 text-sm font-[650] text-[var(--ink)] focus:outline-none focus-visible:outline-none"
                    onChange={(event) => setEditingTitle(event.target.value)}
                    value={editingTitle}
                  />
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {workspace.objects.length} 个对象 · {workspace.tasks.length} 个任务
                  </div>
                </form>
              ) : (
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelect(workspace.id)}
                  type="button"
                >
                  <div className="truncate text-sm font-[650]">{workspace.title}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {workspace.objects.length} 个对象 · {workspace.tasks.length} 个任务
                  </div>
                </button>
              )}
              <div className="flex shrink-0 items-center gap-1 pt-0.5">
                {editingWorkspaceId === workspace.id ? (
                  <>
                    <button
                      aria-label="保存图像画布名称"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-transparent text-[var(--accent-strong)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]"
                      onClick={() => void submitRename(workspace)}
                      title="保存图像画布名称"
                      type="button"
                    >
                      <Check aria-hidden="true" size={13} />
                    </button>
                    <button
                      aria-label="取消重命名图像画布"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-transparent text-[var(--muted-strong)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface)]"
                      onClick={cancelRename}
                      title="取消重命名图像画布"
                      type="button"
                    >
                      <X aria-hidden="true" size={13} />
                    </button>
                  </>
                ) : (
                  <button
                    aria-label="重命名图像画布"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-transparent text-[var(--muted-strong)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface)]"
                    onClick={() => startRename(workspace)}
                    title="重命名图像画布"
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={13} />
                  </button>
                )}
                <button
                  aria-label="删除图像画布"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-transparent text-[var(--muted-strong)] transition-colors hover:border-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                  onClick={() => void deleteWorkspace(workspace)}
                  title="删除图像画布"
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {!filteredWorkspaces.length ? (
          <div className="rounded-[8px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-4 text-xs leading-relaxed text-[var(--muted-strong)]">
            没有匹配的图像画布
          </div>
        ) : null}
      </div>
    </aside>
  );
}
