"use client";

import { CircleStop, Send } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { IconButton } from "./icon-button";
import type { SendState } from "./types";

export function Composer({
  onSend,
  onStop,
  sendState,
}: {
  onSend: (value: string) => void;
  onStop: () => void;
  sendState: SendState;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = value.trim();
    if (!message) return;
    onSend(message);
    setValue("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const isStreaming = sendState === "streaming";

  return (
    <form
      className="mx-auto flex w-full max-w-3xl items-end gap-2.5 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-2.5 transition-colors focus-within:border-[color-mix(in_oklch,var(--accent)_55%,var(--border))]"
      data-streaming={isStreaming}
      onSubmit={submit}
    >
      <textarea
        aria-label="向 Mira Agent 输入消息"
        className="max-h-40 min-h-10 w-full resize-none overflow-y-auto border-0 bg-transparent px-1 py-2 text-[var(--ink)] outline-0 placeholder:text-[var(--muted-strong)] placeholder:opacity-100"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="输入问题、资料或想法..."
        ref={textareaRef}
        rows={1}
        value={value}
      />
      {isStreaming ? (
        <IconButton
          aria-label="停止"
          onClick={onStop}
          type="button"
        >
          <CircleStop aria-hidden="true" size={18} />
        </IconButton>
      ) : (
        <IconButton
          aria-label="发送"
          disabled={!value.trim()}
          variant="primary"
          type="submit"
        >
          <Send aria-hidden="true" size={18} />
        </IconButton>
      )}
    </form>
  );
}
