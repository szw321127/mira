"use client";

import { LockKeyhole, ShieldCheck } from "lucide-react";
import { AdminPasswordPanel } from "./admin-password-panel";
import type { AdminSession } from "./admin-types";

export function AdminSecurityPanel({
  onMessage,
  session,
}: {
  onMessage: (message: string) => void;
  session: AdminSession;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
      <section className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center gap-2 text-sm font-[720]">
          <ShieldCheck aria-hidden="true" size={17} />
          会话状态
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[8px] bg-[var(--surface-muted)] px-3 py-3">
            <dt className="text-xs text-[var(--muted-strong)]">当前管理员</dt>
            <dd className="mt-1 truncate text-sm font-[700]">
              {session.username}
            </dd>
          </div>
          <div className="rounded-[8px] bg-[var(--success-soft)] px-3 py-3">
            <dt className="text-xs text-[var(--muted-strong)]">会话保护</dt>
            <dd className="mt-1 text-sm font-[700] text-[var(--success)]">
              httpOnly Cookie
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center gap-2 text-sm font-[720]">
          <LockKeyhole aria-hidden="true" size={17} />
          管理员凭据
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--muted-strong)]">
          定期更换后台密码，避免共享默认凭据。
        </p>
        <AdminPasswordPanel onMessage={onMessage} />
      </section>
    </div>
  );
}
