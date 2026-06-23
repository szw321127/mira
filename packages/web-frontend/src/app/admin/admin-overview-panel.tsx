"use client";

import {
  ChartNoAxesColumnIncreasing,
  KeyRound,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { AdminSection } from "./admin-navigation";
import type { AdminSession, ManagedSecret } from "./admin-types";

export function AdminOverviewPanel({
  onSelectSection,
  secrets,
  session,
}: {
  onSelectSection: (section: AdminSection) => void;
  secrets: ManagedSecret[];
  session: AdminSession;
}) {
  const configuredSecretCount = secrets.filter((secret) =>
    secret.value.trim(),
  ).length;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <OverviewTile
          icon={UserRound}
          label="当前管理员"
          value={session.username}
        />
        <OverviewTile
          icon={KeyRound}
          label="Key 配置"
          value={`${configuredSecretCount} / ${secrets.length}`}
        />
        <OverviewTile icon={ShieldCheck} label="会话保护" value="Cookie" />
      </div>

      <section className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-[720]">常用模块</div>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-strong)]">
              从这里进入账号、Key 和安全设置，主区域会切换为对应页面。
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction
            description="搜索邮箱账号，调整启用状态。"
            icon={UsersRound}
            label="打开账号管理"
            onClick={() => onSelectSection("users")}
          />
          <QuickAction
            description="查看图像任务、成本和失败状态。"
            icon={ChartNoAxesColumnIncreasing}
            label="打开图像用量"
            onClick={() => onSelectSection("imageUsage")}
          />
          <QuickAction
            description="更新模型和搜索服务密钥。"
            icon={KeyRound}
            label="打开 Key 管理"
            onClick={() => onSelectSection("secrets")}
          />
          <QuickAction
            description="查看会话并修改后台密码。"
            icon={ShieldCheck}
            label="打开安全设置"
            onClick={() => onSelectSection("security")}
          />
        </div>
      </section>
    </div>
  );
}

function OverviewTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2 text-xs font-[650] text-[var(--muted-strong)]">
        <Icon aria-hidden="true" size={15} />
        {label}
      </div>
      <div className="mt-3 truncate text-xl leading-tight font-[760] text-[var(--ink)]">
        {value}
      </div>
    </div>
  );
}

function QuickAction({
  description,
  icon: Icon,
  label,
  onClick,
}: {
  description: string;
  icon: typeof UserRound;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="min-h-[96px] rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center gap-2 text-sm font-[700]">
        <Icon aria-hidden="true" size={16} />
        {label}
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted-strong)]">
        {description}
      </p>
    </button>
  );
}
