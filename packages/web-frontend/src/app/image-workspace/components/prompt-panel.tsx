"use client";

import { FormEvent, useState } from "react";
import { Loader2, Sparkles, Upload, XCircle } from "lucide-react";
import {
  ImageUploadInput,
} from "../../components/image-upload-input";
import type {
  ImageGenerationSettings,
  ImageTask,
  ImageWorkspace,
} from "../types";

const ASPECT_RATIO_OPTIONS: Array<{
  label: string;
  value: ImageGenerationSettings["aspectRatio"];
}> = [
  { label: "1:1", value: "1:1" },
  { label: "2:1", value: "2:1" },
  { label: "4:3", value: "4:3" },
  { label: "16:9", value: "16:9" },
  { label: "1:2", value: "1:2" },
  { label: "3:4", value: "3:4" },
  { label: "9:16", value: "9:16" },
];

const QUALITY_OPTIONS: Array<{
  label: string;
  value: ImageGenerationSettings["quality"];
}> = [
  { label: "自动", value: "auto" },
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
];

const BACKGROUND_OPTIONS: Array<{
  label: string;
  value: ImageGenerationSettings["background"];
}> = [
  { label: "自动", value: "auto" },
  { label: "透明", value: "transparent" },
  { label: "不透明", value: "opaque" },
];

export function PromptPanel({
  activeWorkspace,
  activeTask,
  creatingTask,
  error,
  onCancelTask,
  onGenerate,
  onUploadSourceAsset,
}: {
  activeWorkspace: ImageWorkspace | null;
  activeTask: ImageTask | null;
  creatingTask: boolean;
  error: string | null;
  onCancelTask: (taskId: string) => Promise<void> | void;
  onGenerate: (prompt: string, settings: ImageGenerationSettings) => void;
  onUploadSourceAsset: (file: File) => Promise<void> | void;
}) {
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<ImageGenerationSettings>({
    aspectRatio: "1:1",
    quality: "auto",
    background: "auto",
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onGenerate(prompt, settings);
  }

  function handleFiles(files: File[]) {
    const file = files[0];
    if (file) void onUploadSourceAsset(file);
  }

  return (
    <form className="border-b border-[var(--border)] p-4" onSubmit={submit}>
      <div className="mb-2 flex items-center gap-2 text-sm font-[700]">
        <Sparkles aria-hidden="true" size={16} />
        生成图像
      </div>
      <textarea
        className="min-h-[132px] w-full resize-none rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-sm leading-relaxed placeholder:text-[var(--muted-strong)] focus:border-[var(--accent)] focus:outline-none focus-visible:outline-none"
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="描述你想要的封面、风格、构图和文字留白"
        value={prompt}
      />
      <div className="mt-3 space-y-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] p-3">
        <GenerationOptionGroup
          label="画幅"
          onChange={(aspectRatio) =>
            setSettings((current) => ({ ...current, aspectRatio }))
          }
          options={ASPECT_RATIO_OPTIONS}
          value={settings.aspectRatio}
        />
        <GenerationOptionGroup
          label="质量"
          onChange={(quality) =>
            setSettings((current) => ({ ...current, quality }))
          }
          options={QUALITY_OPTIONS}
          value={settings.quality}
        />
        <GenerationOptionGroup
          label="背景"
          onChange={(background) =>
            setSettings((current) => ({ ...current, background }))
          }
          options={BACKGROUND_OPTIONS}
          value={settings.background}
        />
      </div>
      <button
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] px-3 text-sm font-[700] text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55"
        disabled={creatingTask || !prompt.trim() || !activeWorkspace}
        type="submit"
      >
        {creatingTask ? <Loader2 aria-hidden="true" size={16} /> : null}
        创建生成任务
      </button>
      {activeTask ? (
        <button
          aria-label="中断当前图像任务"
          className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 text-sm font-[700] text-[var(--danger)] transition-colors hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-55"
          disabled={creatingTask}
          onClick={() => onCancelTask(activeTask.id)}
          type="button"
        >
          <XCircle aria-hidden="true" size={16} />
          中断当前任务
        </button>
      ) : null}
      <ImageUploadInput
        accept="image/png,image/jpeg,image/webp"
        className="mt-2"
        disabled={creatingTask || !activeWorkspace}
        multiple={false}
        onFiles={handleFiles}
      >
        {({ dragging, openFileDialog }) => (
          <button
            className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[8px] border px-3 text-sm font-[700] transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
              dragging
                ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-strong)]"
                : "border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--surface-muted)]"
            }`}
            disabled={creatingTask || !activeWorkspace}
            onClick={openFileDialog}
            type="button"
          >
            <Upload aria-hidden="true" size={16} />
            上传源图到画布
          </button>
        )}
      </ImageUploadInput>
      {error ? (
        <div className="mt-3 rounded-[8px] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
          {error}
        </div>
      ) : null}
    </form>
  );
}

function GenerationOptionGroup<Value extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: Value) => void;
  options: Array<{ label: string; value: Value }>;
  value: Value;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-[700] text-[var(--muted-strong)]">{label}</div>
      <div className="grid grid-cols-4 gap-1">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              aria-pressed={selected}
              className={`h-8 rounded-[8px] border px-2 text-xs font-[700] transition-colors focus:outline-none focus-visible:outline-none ${
                selected
                  ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-strong)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)] hover:bg-[var(--surface-muted)]"
              }`}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
