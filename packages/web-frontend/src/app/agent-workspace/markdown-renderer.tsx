"use client";

import { XMarkdown, type ComponentProps } from "@ant-design/x-markdown";
import "@ant-design/x-markdown/themes/light.css";
import { MermaidDiagramBlock } from "./mermaid-diagram-block";

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

    return <MermaidDiagramBlock code={code.trim()} />;
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
