"use client";

type IdeaComposerProps = {
  briefError: string;
  isGenerating: boolean;
  isStartingConversation: boolean;
  onGenerate: () => void;
  onSeedChange: (value: string) => void;
  seed: string;
};

export function IdeaComposer({
  briefError,
  isGenerating,
  isStartingConversation,
  onGenerate,
  onSeedChange,
  seed,
}: IdeaComposerProps) {
  return (
    <section
      className="grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3"
      aria-labelledby="brief-title"
    >
      <div className="grid gap-1">
        <p className="m-0 font-mono text-xs font-black text-[var(--red)]">
          想法
        </p>
        <h2
          className="text-[1rem] font-black leading-tight text-[var(--ink)]"
          id="brief-title"
        >
          输入一句内容方向
        </h2>
      </div>

      <label className="grid gap-1.5 text-[0.82rem] font-extrabold text-[var(--muted)]">
        <span>主题</span>
        <textarea
          aria-describedby={briefError ? "brief-error" : undefined}
          aria-invalid={Boolean(briefError)}
          className="min-h-[96px] resize-y rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 py-2 text-[0.9rem] font-semibold leading-normal text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus-visible:border-[var(--red)] focus-visible:ring-2 focus-visible:ring-[var(--red-soft)]"
          onChange={(event) => onSeedChange(event.target.value)}
          placeholder="例如：新手如何把出租屋阳台改成早餐角"
          rows={4}
          value={seed}
        />
        {briefError ? (
          <small
            className="text-[0.78rem] font-extrabold leading-relaxed text-[var(--red-strong)]"
            id="brief-error"
          >
            {briefError}
          </small>
        ) : null}
      </label>

      <button
        className="min-h-9 justify-self-start rounded-md border border-transparent bg-[var(--red)] px-3 font-black text-[var(--surface)] transition hover:bg-[var(--red-strong)]"
        disabled={isGenerating || isStartingConversation}
        onClick={onGenerate}
        type="button"
      >
        {isGenerating ? "生成中" : "生成大纲"}
      </button>
    </section>
  );
}
