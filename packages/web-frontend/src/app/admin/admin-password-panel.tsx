"use client";

import { Save } from "lucide-react";
import { FormEvent, useState } from "react";
import { changeAdminPassword } from "./admin-api";

const inputClass =
  "mt-2 h-11 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm transition-colors placeholder:text-[var(--muted-strong)] focus:border-[var(--accent)] focus:outline-none focus-visible:outline-none disabled:text-[var(--muted)] md:h-10";

export function AdminPasswordPanel({
  onMessage,
}: {
  onMessage: (message: string) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      await changeAdminPassword(currentPassword, newPassword);
      onMessage("密码已更新");
      setCurrentPassword("");
      setNewPassword("");
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "密码修改失败，请检查当前密码",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="mt-6 border-t border-[var(--border)] pt-4"
      onSubmit={submit}
    >
      <div className="text-sm font-[700]">修改密码</div>
      <input
        autoComplete="current-password"
        className={inputClass}
        disabled={submitting}
        onChange={(event) => setCurrentPassword(event.target.value)}
        placeholder="当前密码"
        type="password"
        value={currentPassword}
      />
      <input
        autoComplete="new-password"
        className={inputClass}
        disabled={submitting}
        onChange={(event) => setNewPassword(event.target.value)}
        placeholder="新密码，至少 8 位"
        type="password"
        value={newPassword}
      />
      <button
        className="mt-3 inline-flex h-11 items-center gap-2 rounded-[9px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm font-[650] transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55 md:h-9"
        disabled={submitting}
        type="submit"
      >
        <Save aria-hidden="true" size={15} />
        保存密码
      </button>
    </form>
  );
}
