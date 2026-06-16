"use client";

import { KeyRound, RefreshCw, Trash2 } from "lucide-react";
import type { XhsAuthorization } from "@/lib/api";

type XhsAuthorizationPanelProps = {
  authorization: XhsAuthorization | null;
  cookieDraft: string;
  error: string;
  isExpanded: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onCookieChange: (value: string) => void;
  onDelete: () => void;
  onRefresh: () => void;
  onSave: () => void;
  onToggleExpanded: () => void;
};

function formatAuthorizationName(authorization: XhsAuthorization | null) {
  if (!authorization) return "未授权";
  return authorization.accountName || authorization.accountId || "已授权账号";
}

export function XhsAuthorizationPanel({
  authorization,
  cookieDraft,
  error,
  isExpanded,
  isLoading,
  isSaving,
  onCookieChange,
  onDelete,
  onRefresh,
  onSave,
  onToggleExpanded,
}: XhsAuthorizationPanelProps) {
  const statusText = authorization
    ? `小红书授权：${formatAuthorizationName(authorization)}`
    : "小红书授权：未授权";
  const iconButtonClass =
    "grid size-9 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)] hover:text-[var(--red-strong)] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <section className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          className="flex min-h-9 min-w-0 items-center gap-2 rounded-md border border-transparent bg-transparent px-0 text-left font-bold text-[var(--ink)]"
          onClick={onToggleExpanded}
          type="button"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--red-soft)] text-[var(--red-strong)]">
            <KeyRound aria-hidden="true" size={16} strokeWidth={2.4} />
          </span>
          <span className="min-w-0 truncate">{statusText}</span>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            aria-label="刷新小红书授权"
            className={iconButtonClass}
            disabled={isLoading || isSaving}
            onClick={onRefresh}
            title="刷新授权"
            type="button"
          >
            <RefreshCw aria-hidden="true" size={15} strokeWidth={2.4} />
          </button>
          {authorization ? (
            <button
              aria-label="删除小红书授权"
              className={iconButtonClass}
              disabled={isLoading || isSaving}
              onClick={onDelete}
              title="删除授权"
              type="button"
            >
              <Trash2 aria-hidden="true" size={15} strokeWidth={2.4} />
            </button>
          ) : null}
          <button
            className="min-h-9 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 text-sm font-black text-[var(--red-strong)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading || isSaving}
            onClick={onToggleExpanded}
            type="button"
          >
            {authorization ? "更新" : "去授权"}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="grid gap-2">
          <label className="grid gap-1.5 text-[0.82rem] font-extrabold text-[var(--muted)]">
            <span>PC Cookie</span>
            <textarea
              className="min-h-[82px] resize-y rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 py-2 text-[0.86rem] font-semibold leading-normal text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus-visible:border-[var(--red)] focus-visible:ring-2 focus-visible:ring-[var(--red-soft)]"
              onChange={(event) => onCookieChange(event.target.value)}
              placeholder="粘贴已登录小红书网页端的 Cookie"
              value={cookieDraft}
            />
          </label>

          {error ? (
            <p className="m-0 text-[0.78rem] font-extrabold leading-relaxed text-[var(--red-strong)]">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="min-h-9 rounded-md border border-transparent bg-[var(--red)] px-3 text-sm font-black text-[var(--surface)] transition hover:bg-[var(--red-strong)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSaving || !cookieDraft.trim()}
              onClick={onSave}
              type="button"
            >
              {isSaving ? "验证中" : "保存授权"}
            </button>
            <span className="text-[0.76rem] font-bold text-[var(--muted)]">
              仅用于当前账号的小红书搜索。
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
