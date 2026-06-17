"use client";

import { Bot, ChevronRight } from "lucide-react";

export function EmptyState({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  const prompts = [
    "总结这段资料并列出下一步",
    "帮我比较两个方案的利弊",
    "把这个想法整理成可执行计划",
  ];

  return (
    <section className="mx-auto flex w-full max-w-[680px] flex-1 flex-col justify-center px-6 pt-14 pb-16 max-md:justify-start max-md:px-[18px] max-md:pt-[42px] max-md:pb-12">
      <div className="mb-[22px] inline-flex h-[46px] w-[46px] items-center justify-center rounded-[14px] border border-[color-mix(in_oklch,var(--accent)_18%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]">
        <Bot aria-hidden="true" size={22} />
      </div>
      <h1 className="m-0 text-[30px] leading-[1.22] font-bold tracking-normal text-balance text-[var(--ink)] max-md:text-[25px]">
        今天想让 agent 帮你做什么？
      </h1>
      <p className="mt-3 mb-0 max-w-[58ch] text-[15px] leading-[1.8] text-pretty text-[var(--muted-strong)]">
        输入问题、资料、计划或想法。Mira 会保留上下文，并把关键过程显示出来。
      </p>
      <div className="mt-7 grid gap-[9px]">
        {prompts.map((prompt) => (
          <button
            className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-left text-[var(--ink)] transition-colors hover:border-[color-mix(in_oklch,var(--accent)_50%,var(--border))] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent-strong)]"
            key={prompt}
            onClick={() => onPrompt(prompt)}
            type="button"
          >
            <span>{prompt}</span>
            <ChevronRight aria-hidden="true" size={16} />
          </button>
        ))}
      </div>
    </section>
  );
}
