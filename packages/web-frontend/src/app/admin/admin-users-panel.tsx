"use client";

import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  UsersRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { loadAdminUsers, updateAdminUserStatus } from "./admin-api";
import type {
  AdminUser,
  AdminUsersResponse,
  AdminUserStatus,
} from "./admin-types";

const inputClass =
  "h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] pr-3 pl-9 text-sm transition-colors placeholder:text-[var(--muted-strong)] focus:border-[var(--accent)] focus:outline-none focus-visible:outline-none disabled:text-[var(--muted)]";

type StatusFilter = "all" | AdminUserStatus;

const statusTabs: Array<{ label: string; value: StatusFilter }> = [
  { label: "全部账号", value: "all" },
  { label: "启用账号", value: "enabled" },
  { label: "禁用账号", value: "disabled" },
];

export function AdminUsersPanel({
  onMessage,
}: {
  onMessage: (message: string) => void;
}) {
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminUsersResponse>({
    users: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const pageCount = useMemo(() => {
    return Math.max(1, Math.ceil(data.total / data.pageSize));
  }, [data.pageSize, data.total]);

  useEffect(() => {
    let active = true;

    loadAdminUsers({
      query,
      status: status === "all" ? undefined : status,
      page,
    })
      .then((nextData) => {
        if (!active) return;
        setData(nextData);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "账号列表加载失败");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, query, status]);

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (queryDraft === query && page === 1) return;
    setLoading(true);
    setPage(1);
    setQuery(queryDraft);
  }

  function selectStatus(nextStatus: StatusFilter) {
    if (nextStatus === status) return;
    setLoading(true);
    setStatus(nextStatus);
    setPage(1);
  }

  async function toggleStatus(user: AdminUser) {
    const nextStatus = user.status === "enabled" ? "disabled" : "enabled";
    setUpdatingUserId(user.id);

    try {
      const { user: updatedUser } = await updateAdminUserStatus(
        user.id,
        nextStatus,
      );
      setData((current) => ({
        ...current,
        users: current.users.map((item) => {
          if (item.id !== user.id) return item;
          return {
            ...item,
            ...updatedUser,
            conversationCount: item.conversationCount,
          };
        }),
      }));
      onMessage(nextStatus === "enabled" ? "账号已启用" : "账号已禁用");
    } catch (updateError) {
      onMessage(
        updateError instanceof Error ? updateError.message : "账号状态更新失败",
      );
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <section className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-[700]">
            <UsersRound aria-hidden="true" size={17} />
            账号管理
          </div>
          <p className="mt-1 text-xs text-[var(--muted-strong)]">
            查看邮箱登录账号，按状态筛选，并控制账号是否可继续使用 Mira。
          </p>
        </div>
        <div className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--muted-strong)]">
          共 {data.total} 个账号
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <form className="relative min-w-0 md:w-[320px]" onSubmit={submitSearch}>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--muted)]"
            size={15}
          />
          <input
            className={inputClass}
            onChange={(event) => setQueryDraft(event.target.value)}
            placeholder="搜索邮箱"
            value={queryDraft}
          />
        </form>
        <div className="inline-flex overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)]">
          {statusTabs.map((tab) => (
            <button
              className={`h-9 border-r border-[var(--border)] px-3 text-sm last:border-r-0 ${
                status === tab.value
                  ? "bg-[var(--accent-subtle)] font-[700] text-[var(--accent-strong)]"
                  : "text-[var(--muted-strong)] hover:bg-[var(--surface-muted)]"
              }`}
              key={tab.value}
              onClick={() => selectStatus(tab.value)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-[8px] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-[8px] border border-[var(--border)]">
        <div className="hidden md:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[var(--surface-muted)] text-xs text-[var(--muted-strong)]">
              <tr>
                <th className="px-3 py-2 font-[650]">邮箱</th>
                <th className="px-3 py-2 font-[650]">状态</th>
                <th className="px-3 py-2 font-[650]">对话</th>
                <th className="px-3 py-2 font-[650]">最近登录</th>
                <th className="px-3 py-2 text-right font-[650]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {data.users.map((user) => (
                <tr className="bg-[var(--surface)]" key={user.id}>
                  <td className="px-3 py-3 font-[650]">{user.email}</td>
                  <td className="px-3 py-3">{renderStatus(user.status)}</td>
                  <td className="px-3 py-3 text-[var(--muted-strong)]">
                    {user.conversationCount ?? 0}
                  </td>
                  <td className="px-3 py-3 text-[var(--muted-strong)]">
                    {formatDate(user.lastLoginAt)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <StatusActionButton
                      disabled={updatingUserId === user.id}
                      onClick={() => void toggleStatus(user)}
                      status={user.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-[var(--border)] md:hidden">
          {data.users.map((user) => (
            <div className="bg-[var(--surface)] p-3" key={user.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-[700]">{user.email}</div>
                  <div className="mt-1 text-xs text-[var(--muted-strong)]">
                    {user.conversationCount ?? 0} 个对话 · 最近登录{" "}
                    {formatDate(user.lastLoginAt)}
                  </div>
                </div>
                {renderStatus(user.status)}
              </div>
              <div className="mt-3">
                <StatusActionButton
                  disabled={updatingUserId === user.id}
                  onClick={() => void toggleStatus(user)}
                  status={user.status}
                />
              </div>
            </div>
          ))}
        </div>

        {!loading && data.users.length === 0 ? (
          <div className="bg-[var(--surface)] px-3 py-8 text-center text-sm text-[var(--muted-strong)]">
            暂无匹配账号
          </div>
        ) : null}

        {loading ? (
          <div className="bg-[var(--surface)] px-3 py-8 text-center text-sm text-[var(--muted-strong)]">
            正在加载账号
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted-strong)]">
        <span>
          第 {data.page} / {pageCount} 页
        </span>
        <div className="inline-flex items-center gap-2">
          <button
            className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading || page <= 1}
            onClick={() => {
              setLoading(true);
              setPage((current) => Math.max(1, current - 1));
            }}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={15} />
            上一页
          </button>
          <button
            className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading || page >= pageCount}
            onClick={() => {
              setLoading(true);
              setPage((current) => Math.min(pageCount, current + 1));
            }}
            type="button"
          >
            下一页
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}

function StatusActionButton({
  disabled,
  onClick,
  status,
}: {
  disabled: boolean;
  onClick: () => void;
  status: AdminUserStatus;
}) {
  const enabling = status === "disabled";

  return (
    <button
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border px-3 text-sm font-[650] transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
        enabling
          ? "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--success)] hover:bg-[var(--success-soft)]"
          : "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--danger)] hover:bg-[var(--danger-soft)]"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {enabling ? (
        <CheckCircle2 aria-hidden="true" size={15} />
      ) : (
        <Ban aria-hidden="true" size={15} />
      )}
      {enabling ? "启用账号" : "禁用账号"}
    </button>
  );
}

function renderStatus(status: AdminUserStatus) {
  return (
    <span
      className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-[700] ${
        status === "enabled"
          ? "bg-[var(--success-soft)] text-[var(--success)]"
          : "bg-[var(--danger-soft)] text-[var(--danger)]"
      }`}
    >
      {status === "enabled" ? "启用中" : "已禁用"}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return "未登录";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
