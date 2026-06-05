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
      className="grid gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"
      aria-labelledby="brief-title"
    >
      <div className="grid gap-1">
        <p className="section-kicker">想法</p>
        <h2
          className="text-[1.08rem] font-black leading-tight text-[var(--ink)]"
          id="brief-title"
        >
          输入一句内容方向
        </h2>
      </div>

      <label className="grid gap-2 text-[0.82rem] font-extrabold text-[var(--muted)]">
        <span>主题</span>
        <textarea
          aria-describedby={briefError ? "brief-error" : undefined}
          aria-invalid={Boolean(briefError)}
          className="min-h-[132px] resize-y rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 py-2.5 text-[0.92rem] font-semibold leading-relaxed text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus-visible:border-[var(--red)] focus-visible:ring-2 focus-visible:ring-[var(--red-soft)]"
          onChange={(event) => onSeedChange(event.target.value)}
          placeholder="例如：新手如何把出租屋阳台改成早餐角"
          rows={5}
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
        className="primary-action justify-self-start"
        disabled={isGenerating || isStartingConversation}
        onClick={onGenerate}
        type="button"
      >
        {isGenerating ? "生成中" : "生成大纲"}
      </button>
    </section>
  );
}
