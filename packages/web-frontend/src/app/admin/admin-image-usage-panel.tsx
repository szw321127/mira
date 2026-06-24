"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadAdminImageUsage } from "./admin-api";
import type {
  AdminImageUsageModel,
  AdminImageUsageProvider,
  AdminImageUsageResponse,
  AdminImageUsageType,
} from "./admin-types";

const statusLabels: Record<
  keyof AdminImageUsageResponse["statusCounts"],
  string
> = {
  canceled: "已取消",
  complete: "已完成",
  failed: "失败",
  queued: "排队中",
  running: "运行中",
};

export function AdminImageUsagePanel({
  showHeader = true,
}: {
  showHeader?: boolean;
}) {
  const initialLoadStartedRef = useRef(false);
  const [usage, setUsage] = useState<AdminImageUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function refreshUsage() {
    setLoading(true);
    setMessage("");

    try {
      setUsage(await loadAdminImageUsage());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图像用量加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;
    queueMicrotask(() => {
      void refreshUsage();
    });
  }, []);

  const failedTaskCount = usage?.statusCounts.failed ?? 0;
  const runningTaskCount = useMemo(() => {
    if (!usage) return 0;
    return usage.statusCounts.queued + usage.statusCounts.running;
  }, [usage]);

  return (
    <div className="grid gap-4">
      {showHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-[760]">图像用量</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-strong)]">
              查看最近图像任务、成本估算和失败状态。
            </p>
          </div>
          <RefreshButton loading={loading} onClick={() => void refreshUsage()} />
        </div>
      ) : (
        <div className="flex justify-end">
          <RefreshButton loading={loading} onClick={() => void refreshUsage()} />
        </div>
      )}

      {message ? (
        <div className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
          {message}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <UsageTile
          label={`${usage?.windowDays ?? 30} 天任务`}
          loading={loading}
          value={usage ? String(usage.totalTasks) : "--"}
        />
        <UsageTile
          label="估算成本"
          loading={loading}
          value={usage ? formatUsd(usage.estimatedCostUsd) : "--"}
        />
        <UsageTile
          label="活跃用户"
          loading={loading}
          value={usage ? String(usage.activeUsers) : "--"}
        />
        <UsageTile
          label="运行/失败"
          loading={loading}
          value={usage ? `${runningTaskCount} / ${failedTaskCount}` : "--"}
        />
      </div>

      <section className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="text-sm font-[720]">任务状态</div>
        <div className="mt-3 grid gap-2 md:grid-cols-5">
          {(
            Object.entries(statusLabels) as Array<
              [keyof AdminImageUsageResponse["statusCounts"], string]
            >
          ).map(([status, label]) => (
            <div
              className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-3"
              key={status}
            >
              <div className="text-xs text-[var(--muted-strong)]">{label}</div>
              <div className="mt-2 text-lg leading-tight font-[760]">
                {usage?.statusCounts[status] ?? 0}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <BreakdownTable
          emptyLabel="暂无模型用量"
          rows={usage?.byModel ?? []}
          title="模型"
          valueKey="model"
        />
        <BreakdownTable
          emptyLabel="暂无 provider 用量"
          rows={usage?.byProvider ?? []}
          title="Provider"
          valueKey="provider"
        />
        <BreakdownTable
          emptyLabel="暂无类型用量"
          rows={usage?.byType ?? []}
          title="任务类型"
          valueKey="type"
        />
      </div>
    </div>
  );
}

function RefreshButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm font-[650] transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60 md:h-9"
      disabled={loading}
      onClick={onClick}
      type="button"
    >
      <RefreshCw aria-hidden="true" size={15} />
      {loading ? "刷新中" : "刷新"}
    </button>
  );
}

function UsageTile({
  label,
  loading,
  value,
}: {
  label: string;
  loading: boolean;
  value: string;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="text-xs font-[650] text-[var(--muted-strong)]">
        {label}
      </div>
      <div className="mt-3 truncate text-xl leading-tight font-[760]">
        {loading ? "--" : value}
      </div>
    </div>
  );
}

function BreakdownTable({
  emptyLabel,
  rows,
  title,
  valueKey,
}: {
  emptyLabel: string;
  rows: Array<AdminImageUsageModel | AdminImageUsageProvider | AdminImageUsageType>;
  title: string;
  valueKey: "model" | "provider" | "type";
}) {
  return (
    <section className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="text-sm font-[720]">{title}</div>
      <div className="mt-3 overflow-x-auto">
        {rows.length ? (
          <table className="w-full min-w-[360px] text-left text-xs">
            <thead className="text-[var(--muted-strong)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 pr-3 font-[650]">{title}</th>
                <th className="py-2 pr-3 font-[650]">任务数</th>
                <th className="py-2 font-[650]">估算成本</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowName =
                  valueKey === "model"
                    ? (row as AdminImageUsageModel).model
                    : valueKey === "provider"
                      ? (row as AdminImageUsageProvider).provider
                      : (row as AdminImageUsageType).type;

                return (
                  <tr
                    className="border-b border-[var(--border)] last:border-b-0"
                    key={`${valueKey}-${rowName}`}
                  >
                    <td className="max-w-[180px] truncate py-2 pr-3 font-[650]">
                      {rowName}
                    </td>
                    <td className="py-2 pr-3 text-[var(--muted-strong)]">
                      {row.taskCount}
                    </td>
                    <td className="py-2 text-[var(--muted-strong)]">
                      {formatUsd(row.estimatedCostUsd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-4 text-xs text-[var(--muted-strong)]">
            {emptyLabel}
          </div>
        )}
      </div>
    </section>
  );
}

function formatUsd(value: number) {
  return `$${value.toFixed(3)}`;
}
