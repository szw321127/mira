"use client";

import {
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";

export const IMAGE_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp";

const SUPPORTED_IMAGE_TYPES = new Set(IMAGE_UPLOAD_ACCEPT.split(","));

type ImageUploadInputRenderProps = {
  dragging: boolean;
  openFileDialog: () => void;
};

export function ImageUploadInput({
  accept = IMAGE_UPLOAD_ACCEPT,
  children,
  className,
  disabled = false,
  multiple = true,
  onFiles,
}: {
  accept?: string;
  children: ReactNode | ((props: ImageUploadInputRenderProps) => ReactNode);
  className?: string;
  disabled?: boolean;
  multiple?: boolean;
  onFiles: (files: File[]) => Promise<void> | void;
}) {
  const [dragging, setDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function openFileDialog() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function emitFiles(files: File[]) {
    if (disabled) return;
    const supported = files
      .filter(isSupportedImageFile)
      .slice(0, multiple ? undefined : 1);
    if (supported.length === 0) return;
    void onFiles(supported);
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragging(true);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    emitFiles(Array.from(event.dataTransfer.files));
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const files = Array.from(event.clipboardData.items)
      .map((item) => (item.kind === "file" ? item.getAsFile() : null))
      .filter((file): file is File => Boolean(file));
    if (files.length === 0) return;
    event.preventDefault();
    emitFiles(files);
  }

  return (
    <div
      className={className}
      data-dragging={dragging}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      <input
        accept={accept}
        className="sr-only"
        disabled={disabled}
        multiple={multiple}
        onChange={(event) => {
          emitFiles(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      {typeof children === "function"
        ? children({ dragging, openFileDialog })
        : children}
    </div>
  );
}

export function isSupportedImageFile(file: File) {
  return SUPPORTED_IMAGE_TYPES.has(file.type);
}

export function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("图片读取失败"));
    };
    reader.readAsDataURL(file);
  });
}
