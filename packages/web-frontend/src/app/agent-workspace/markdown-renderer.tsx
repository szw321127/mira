"use client";

import { Mermaid } from "@ant-design/x";
import { XMarkdown, type ComponentProps } from "@ant-design/x-markdown";
import "@ant-design/x-markdown/themes/light.css";

function readCodeText(children: ComponentProps["children"]) {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children
      .map((child) => (typeof child === "string" ? child : ""))
      .join("");
  }

  return "";
}

function MarkdownCodeBlock({
  block,
  children,
  className,
  lang,
  streamStatus,
}: ComponentProps) {
  const code = readCodeText(children);
  const normalizedLang = lang?.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

  if (block && normalizedLang === "mermaid") {
    if (streamStatus === "loading") {
      return (
        <pre>
          <code className={className}>{children}</code>
        </pre>
      );
    }

    return (
      <div className="my-2 overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
        <Mermaid
          actions={{
            enableCopy: true,
            enableDownload: true,
            enableZoom: true,
          }}
          className="text-[13px]"
          classNames={{
            code: "max-h-[420px] overflow-auto",
            graph: "min-h-[180px] overflow-auto",
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
          {code.trim()}
        </Mermaid>
      </div>
    );
  }

  if (block) {
    return (
      <pre>
        <code className={className}>{children}</code>
      </pre>
    );
  }

  return <code>{children}</code>;
}

function MarkdownPre({ children }: ComponentProps) {
  return <>{children}</>;
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <XMarkdown
      className="message-markdown"
      components={{
        code: MarkdownCodeBlock,
        pre: MarkdownPre,
      }}
      content={content}
      escapeRawHtml
      openLinksInNewTab
    />
  );
}
