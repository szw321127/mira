"use client";

import { Mermaid } from "@ant-design/x";
import { Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";

function MermaidChart({
  code,
  fullscreen = false,
}: {
  code: string;
  fullscreen?: boolean;
}) {
  return (
    <Mermaid
      actions={{
        enableCopy: true,
        enableDownload: true,
        enableZoom: true,
      }}
      className="text-[13px]"
      classNames={{
        code: fullscreen
          ? "max-h-[calc(100dvh-150px)] overflow-auto"
          : "max-h-[420px] overflow-auto",
        graph: fullscreen
          ? "min-h-[calc(100dvh-150px)] overflow-auto"
          : "min-h-[180px] overflow-auto",
        header: "border-b border-[var(--border)]",
      }}
      config={{
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        securityLevel: "strict",
        theme: "default",
      }}
      styles={{
        root: { border: "none" },
      }}
    >
      {code}
    </Mermaid>
  );
}

export function MermaidDiagramBlock({ code }: { code: string }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsFullscreen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isFullscreen]);

  return (
    <>
      <div className="my-2 overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex min-h-9 items-center justify-end border-b border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1">
          <button
            aria-label="全屏查看图表"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
            onClick={() => setIsFullscreen(true)}
            type="button"
          >
            <Maximize2 aria-hidden="true" size={15} />
          </button>
        </div>
        <MermaidChart code={code} />
      </div>

      {isFullscreen ? (
        <div
          aria-label="Mermaid 图表全屏查看"
          aria-modal="true"
          className="fixed inset-0 z-50 flex flex-col bg-[var(--background)] text-[var(--ink)]"
          role="dialog"
        >
          <div className="flex min-h-12 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4">
            <span className="text-[13px] font-[650] text-[var(--ink)]">
              Mermaid 图表
            </span>
            <button
              aria-label="关闭全屏图表"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
              onClick={() => setIsFullscreen(false)}
              type="button"
            >
              <X aria-hidden="true" size={17} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-3 max-md:p-2">
            <div className="h-full overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
              <MermaidChart code={code} fullscreen />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
