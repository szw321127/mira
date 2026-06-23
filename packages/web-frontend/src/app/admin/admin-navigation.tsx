"use client";

import {
  ChartNoAxesColumnIncreasing,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { AdminSession } from "./admin-types";

export type AdminSection =
  | "overview"
  | "users"
  | "imageUsage"
  | "secrets"
  | "security";

export type AdminNavigationItem = {
  id: AdminSection;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export const adminNavigationItems: AdminNavigationItem[] = [
  {
    id: "overview",
    label: "总览",
    title: "后台总览",
    description: "查看当前会话、配置状态和常用入口。",
    icon: LayoutDashboard,
  },
  {
    id: "users",
    label: "账号管理",
    title: "账号管理",
    description: "搜索邮箱登录账号，并控制账号是否可以继续使用 Mira。",
    icon: UsersRound,
  },
  {
    id: "imageUsage",
    label: "图像用量",
    title: "图像用量",
    description: "查看图像任务、成本和失败状态。",
    icon: ChartNoAxesColumnIncreasing,
  },
  {
    id: "secrets",
    label: "Key 管理",
    title: "Key 管理",
    description: "配置模型、搜索等后端服务密钥，保存后仅展示掩码。",
    icon: KeyRound,
  },
  {
    id: "security",
    label: "安全设置",
    title: "安全设置",
    description: "查看管理员会话状态，并更新后台登录密码。",
    icon: ShieldCheck,
  },
];

export function isAdminSection(value: string | null): value is AdminSection {
  return adminNavigationItems.some((item) => item.id === value);
}

export function getAdminNavigationItem(section: AdminSection) {
  return (
    adminNavigationItems.find((item) => item.id === section) ??
    adminNavigationItems[0]
  );
}

export function AdminNavigation({
  activeSection,
  onLogout,
  onSectionChange,
  session,
}: {
  activeSection: AdminSection;
  onLogout: () => void;
  onSectionChange: (section: AdminSection) => void;
  session: AdminSession;
}) {
  const activeItem = getAdminNavigationItem(activeSection);

  return (
    <>
      <aside className="hidden min-h-dvh w-[248px] shrink-0 border-r border-[var(--border)] bg-[var(--surface)] lg:flex lg:flex-col">
        <div className="border-b border-[var(--border)] px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[var(--accent-subtle)] text-[var(--accent-strong)]">
              <ShieldCheck aria-hidden="true" size={19} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-[720]">Mira Admin</div>
              <div className="truncate text-xs text-[var(--muted-strong)]">
                控制台
              </div>
            </div>
          </div>
        </div>

        <nav aria-label="Admin modules" className="min-w-0 flex-1 px-3 py-3">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
            {adminNavigationItems.map((item) => (
              <NavigationButton
                active={activeSection === item.id}
                item={item}
                key={item.id}
                onClick={() => onSectionChange(item.id)}
              />
            ))}
          </div>
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <div className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-3">
            <div className="text-xs text-[var(--muted-strong)]">当前管理员</div>
            <div className="mt-1 truncate text-sm font-[700]">
              {session.username}
            </div>
          </div>
          <button
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm font-[650] transition-colors hover:bg-[var(--surface-muted)]"
            onClick={onLogout}
            type="button"
          >
            <LogOut aria-hidden="true" size={16} />
            退出后台
          </button>
        </div>
      </aside>

      <div className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--background)_88%,var(--surface))] lg:hidden">
        <div className="flex min-h-[57px] items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            <div className="text-sm font-[720]">Mira Admin</div>
            <div className="truncate text-xs text-[var(--muted-strong)]">
              {activeItem.label}
            </div>
          </div>
          <button
            aria-label="退出后台"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface)] transition-colors hover:bg-[var(--surface-muted)]"
            onClick={onLogout}
            type="button"
          >
            <LogOut aria-hidden="true" size={16} />
          </button>
        </div>
        <nav
          aria-label="Admin mobile modules"
          className="flex gap-2 overflow-x-auto px-4 pb-3"
        >
          {adminNavigationItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;

            return (
              <button
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-[8px] border px-3 text-sm font-[650] transition-colors ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-strong)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)] hover:bg-[var(--surface-muted)]"
                }`}
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={15} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}

function NavigationButton({
  active,
  item,
  onClick,
}: {
  active: boolean;
  item: AdminNavigationItem;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <button
      aria-current={active ? "page" : undefined}
      className={`group flex min-h-11 min-w-0 w-full items-center gap-3 rounded-[8px] px-3 text-left transition-colors ${
        active
          ? "bg-[var(--accent-subtle)] text-[var(--accent-strong)]"
          : "text-[var(--muted-strong)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
      }`}
      onClick={onClick}
      type="button"
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] ${
          active
            ? "bg-[var(--surface)] text-[var(--accent-strong)]"
            : "bg-[var(--surface-raised)] text-[var(--muted-strong)] group-hover:text-[var(--ink)]"
        }`}
      >
        <Icon aria-hidden="true" size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-[700]">{item.label}</span>
        <span className="block truncate text-xs opacity-80">
          {item.description}
        </span>
      </span>
    </button>
  );
}
