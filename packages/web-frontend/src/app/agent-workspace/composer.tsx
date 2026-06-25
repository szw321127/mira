"use client";

import { CircleStop, ImagePlus, Send, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  ImageUploadInput,
  isSupportedImageFile,
  readImageFileAsDataUrl,
} from "../components/image-upload-input";
import { IconButton } from "./icon-button";
import type { ChatImageAttachment, SendState } from "./types";

const MAX_CHAT_ATTACHMENTS = 6;

export function Composer({
  onSend,
  onStop,
  sendState,
}: {
  onSend: (value: string, attachments?: ChatImageAttachment[]) => void;
  onStop: () => void;
  sendState: SendState;
}) {
  const [attachments, setAttachments] = useState<ChatImageAttachment[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
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
    if (!message && attachments.length === 0) return;
    onSend(message, attachments);
    setValue("");
    clearAttachments();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function addFiles(files: File[]) {
    if (sendState === "streaming") return;
    const supported = files.filter(isSupportedImageFile);
    const rejected = files.length - supported.length;
    const remaining = MAX_CHAT_ATTACHMENTS - attachments.length;

    if (rejected > 0) {
      setLocalError("仅支持 PNG、JPEG 或 WebP 图片");
    } else {
      setLocalError(null);
    }

    if (remaining <= 0) {
      setLocalError(`一次最多添加 ${MAX_CHAT_ATTACHMENTS} 张图片`);
      return;
    }

    const selected = supported.slice(0, remaining);
    if (selected.length === 0) return;

    const nextAttachments = await Promise.all(selected.map(fileToAttachment));
    setAttachments((current) =>
      [...current, ...nextAttachments].slice(0, MAX_CHAT_ATTACHMENTS),
    );
  }

  function clearAttachments() {
    setAttachments([]);
    setLocalError(null);
  }

  function removeAttachment(id: string) {
    setAttachments((current) =>
      current.filter((attachment) => attachment.id !== id),
    );
  }

  const isStreaming = sendState === "streaming";
  const canSubmit = Boolean(value.trim() || attachments.length);

  return (
    <ImageUploadInput
      className="mx-auto w-full max-w-3xl"
      disabled={isStreaming}
      onFiles={addFiles}
    >
      {({ dragging, openFileDialog }) => (
        <form
          className={`flex w-full flex-col gap-2.5 rounded-[14px] border bg-[var(--surface)] p-2.5 transition-colors focus-within:border-[color-mix(in_oklch,var(--accent)_55%,var(--border))] ${
            dragging
              ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
              : "border-[var(--border)]"
          }`}
          data-streaming={isStreaming}
          onSubmit={submit}
        >
          {attachments.length ? (
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {attachments.map((attachment) => (
                <div
                  className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)]"
                  key={attachment.id}
                >
                  <img
                    alt={attachment.name || "上传图片"}
                    className="h-full w-full object-cover"
                    src={attachment.dataUrl}
                  />
                  <button
                    aria-label={`移除 ${attachment.name}`}
                    className="absolute top-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[oklch(0.18_0.016_260/0.72)] text-white transition-colors hover:bg-[oklch(0.14_0.016_260/0.9)]"
                    onClick={() => removeAttachment(attachment.id)}
                    type="button"
                  >
                    <X aria-hidden="true" size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex items-end gap-2.5">
            <IconButton
              aria-label="添加图片"
              disabled={isStreaming || attachments.length >= MAX_CHAT_ATTACHMENTS}
              onClick={openFileDialog}
              type="button"
            >
              <ImagePlus aria-hidden="true" size={18} />
            </IconButton>
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
                disabled={!canSubmit}
                variant="primary"
                type="submit"
              >
                <Send aria-hidden="true" size={18} />
              </IconButton>
            )}
          </div>
          {localError ? (
            <p className="m-0 px-1 text-xs leading-5 text-[var(--danger)]">
              {localError}
            </p>
          ) : null}
        </form>
      )}
    </ImageUploadInput>
  );
}

async function fileToAttachment(file: File): Promise<ChatImageAttachment> {
  const dataUrl = await readImageFileAsDataUrl(file);
  return {
    id: createAttachmentId(),
    type: "image",
    name: file.name || "image",
    mimeType: file.type as ChatImageAttachment["mimeType"],
    dataUrl,
    sizeBytes: file.size,
  };
}

function createAttachmentId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `att-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
