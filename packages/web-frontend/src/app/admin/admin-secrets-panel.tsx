"use client";

import { KeyRound, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import {
  loadAdminSecrets,
  saveAdminSecrets,
  testAdminImageProvider,
} from "./admin-api";
import type { AdminImageProviderTestResponse, ManagedSecret } from "./admin-types";

const inputClass =
  "h-11 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm transition-colors placeholder:text-[var(--muted-strong)] focus:border-[var(--accent)] focus:outline-none focus-visible:outline-none disabled:text-[var(--muted)] md:h-10";

export function AdminSecretsPanel({
  secrets,
  onMessage,
  onSecrets,
  showHeader = true,
}: {
  secrets: ManagedSecret[];
  onMessage: (message: string) => void;
  onSecrets: (secrets: ManagedSecret[]) => void;
  showHeader?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [testingProvider, setTestingProvider] = useState(false);
  const [providerResult, setProviderResult] =
    useState<AdminImageProviderTestResponse | null>(null);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      onSecrets(await loadAdminSecrets());
      onMessage("Key 列表已刷新");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Key 加载失败");
    } finally {
      setRefreshing(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const secretsPayload = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value.trim().length > 0),
    );
    if (Object.keys(secretsPayload).length === 0) {
      onMessage("没有需要保存的 Key");
      return;
    }

    setSubmitting(true);
    try {
      onSecrets(await saveAdminSecrets(secretsPayload));
      onMessage("Key 配置已保存");
      setValues({});
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Key 保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function testProvider() {
    if (testingProvider) return;
    setTestingProvider(true);
    try {
      const result = await testAdminImageProvider();
      setProviderResult(result);
      onMessage(result.message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "图像 Provider 测试失败";
      setProviderResult({
        configured: false,
        missingKeys: [],
        model: null,
        ok: false,
        provider: "openai",
        message,
      });
      onMessage(message);
    } finally {
      setTestingProvider(false);
    }
  }

  return (
    <section className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div
        className={`flex flex-wrap items-center gap-3 ${
          showHeader ? "justify-between" : "justify-end"
        }`}
      >
        {showHeader ? (
          <div>
            <div className="flex items-center gap-2 text-sm font-[700]">
              <KeyRound aria-hidden="true" size={17} />
              Key 管理
            </div>
            <p className="mt-1 text-xs text-[var(--muted-strong)]">
              管理模型、搜索等后端服务配置。敏感值保存后只展示掩码。
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex h-11 items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm font-[650] transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55 md:h-9"
            disabled={testingProvider}
            onClick={() => void testProvider()}
            type="button"
          >
            <ShieldCheck aria-hidden="true" size={15} />
            {testingProvider ? "测试中" : "测试图像 Provider"}
          </button>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm font-[650] transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55 md:h-9"
            disabled={refreshing}
            onClick={() => void refresh()}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={15} />
            刷新
          </button>
        </div>
      </div>

      {providerResult ? (
        <div
          className={`mt-4 rounded-[8px] border px-3 py-2 text-xs leading-5 ${
            providerResult.ok
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <div className="font-[700]">{providerResult.message}</div>
          <div className="mt-1">
            Provider: {providerResult.provider}
            {providerResult.model ? ` · 模型: ${providerResult.model}` : ""}
            {providerResult.missingKeys.length
              ? ` · 缺少: ${providerResult.missingKeys.join(", ")}`
              : ""}
          </div>
        </div>
      ) : null}

      <form className="mt-4" onSubmit={submit}>
        <div className="overflow-hidden rounded-[8px] border border-[var(--border)]">
          {secrets.map((secret) => (
            <div
              className="grid gap-3 border-b border-[var(--border)] bg-[var(--surface-raised)] p-3 last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)]"
              key={secret.key}
            >
              <div>
                <div className="text-sm font-[650]">{secret.label}</div>
                <div className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                  {secret.key}
                </div>
              </div>
              <div className="min-w-0">
                <div className="mb-2 truncate font-mono text-xs text-[var(--muted-strong)]">
                  当前：{secret.value || "未配置"}
                </div>
                <input
                  className={inputClass}
                  disabled={submitting}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [secret.key]: event.target.value,
                    }))
                  }
                  placeholder={secret.masked ? "输入新值后覆盖" : "输入新值"}
                  type={secret.masked ? "password" : "text"}
                  value={values[secret.key] ?? ""}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-[9px] bg-[var(--accent)] px-4 text-sm font-[700] text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55 md:h-10"
          disabled={submitting}
          type="submit"
        >
          <Save aria-hidden="true" size={16} />
          保存 Key 配置
        </button>
      </form>
    </section>
  );
}
