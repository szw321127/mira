"use client";

import type { ReactNode } from "react";
import {
  type AdminSection,
  getAdminNavigationItem,
} from "./admin-navigation";

export function AdminSectionFrame({
  children,
  section,
}: {
  children: ReactNode;
  section: AdminSection;
}) {
  const item = getAdminNavigationItem(section);
  const Icon = item.icon;

  return (
    <section className="min-w-0">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[var(--accent-subtle)] text-[var(--accent-strong)]">
            <Icon aria-hidden="true" size={19} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[22px] leading-tight font-[760] text-[var(--ink)]">
              {item.title}
            </h1>
            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[var(--muted-strong)]">
              {item.description}
            </p>
          </div>
        </div>
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-[650] text-[var(--muted-strong)]">
          Mira Admin
        </div>
      </div>
      {children}
    </section>
  );
}
