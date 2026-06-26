export type ChatMessageRole = "user" | "assistant";
export type ChatMessageStatus = "complete" | "streaming" | "stopped" | "error";

export type PersistedChatMessage = {
  id?: string;
  role: ChatMessageRole;
  content: string;
  attachments?: PersistedChatImageAttachment[];
  generatedImages?: PersistedChatGeneratedImage[];
  status?: ChatMessageStatus;
  events?: unknown[];
  createdAt?: string;
};

export type PersistedChatImageAttachment = {
  id: string;
  type: "image";
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  dataUrl: string;
  sizeBytes: number;
};

export type PersistedChatGeneratedImage = {
  id: string;
  prompt: string;
  status: "running" | "complete" | "error";
  imageBase64: string | null;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  partialIndex: number;
  progressStage?: "queued" | "generating" | "finalizing";
  progressMessage?: string;
  updatedAt: string;
};

export function parseTitle(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;

  const title = (body as { title?: unknown }).title;
  if (typeof title !== "string") return null;

  const trimmed = title.trim();
  if (!trimmed || trimmed.length > 120) return null;

  return trimmed;
}

export function parseMessages(body: unknown): PersistedChatMessage[] | null {
  if (!body || typeof body !== "object") return null;

  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return null;

  const parsed: PersistedChatMessage[] = [];

  for (const message of messages) {
    if (!message || typeof message !== "object") return null;
    const raw = message as Record<string, unknown>;

    if (!isMessageRole(raw.role) || typeof raw.content !== "string") {
      return null;
    }

    if (raw.status !== undefined && !isMessageStatus(raw.status)) {
      return null;
    }

    if (raw.id !== undefined && typeof raw.id !== "string") {
      return null;
    }

    if (raw.attachments !== undefined && !isMessageAttachments(raw.attachments)) {
      return null;
    }

    if (
      raw.generatedImages !== undefined &&
      !isGeneratedImages(raw.generatedImages)
    ) {
      return null;
    }

    if (
      raw.createdAt !== undefined &&
      (typeof raw.createdAt !== "string" || !isValidDateString(raw.createdAt))
    ) {
      return null;
    }

    parsed.push({
      ...(typeof raw.id === "string" ? { id: raw.id } : {}),
      role: raw.role,
      content: raw.content,
      attachments: isMessageAttachments(raw.attachments) ? raw.attachments : [],
      generatedImages: isGeneratedImages(raw.generatedImages)
        ? raw.generatedImages
        : [],
      ...(isMessageStatus(raw.status) ? { status: raw.status } : {}),
      events: Array.isArray(raw.events) ? raw.events : [],
      ...(typeof raw.createdAt === "string" ? { createdAt: raw.createdAt } : {})
    });
  }

  return parsed;
}

function isMessageRole(value: unknown): value is ChatMessageRole {
  return value === "user" || value === "assistant";
}

function isMessageStatus(value: unknown): value is ChatMessageStatus {
  return (
    value === "complete" ||
    value === "streaming" ||
    value === "stopped" ||
    value === "error"
  );
}

function isMessageAttachments(
  value: unknown
): value is PersistedChatImageAttachment[] {
  if (value === undefined) return false;
  if (!Array.isArray(value)) return false;
  return value.every(isMessageAttachment);
}

function isMessageAttachment(value: unknown): value is PersistedChatImageAttachment {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    record.type === "image" &&
    typeof record.name === "string" &&
    isSupportedImageMimeType(record.mimeType) &&
    typeof record.dataUrl === "string" &&
    record.dataUrl.startsWith(`data:${record.mimeType};base64,`) &&
    typeof record.sizeBytes === "number" &&
    Number.isFinite(record.sizeBytes) &&
    record.sizeBytes >= 0
  );
}

function isGeneratedImages(
  value: unknown
): value is PersistedChatGeneratedImage[] {
  if (value === undefined) return false;
  if (!Array.isArray(value)) return false;
  return value.every(isGeneratedImage);
}

function isGeneratedImage(value: unknown): value is PersistedChatGeneratedImage {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.prompt === "string" &&
    isGeneratedImageStatus(record.status) &&
    (typeof record.imageBase64 === "string" || record.imageBase64 === null) &&
    isSupportedImageMimeType(record.mimeType) &&
    typeof record.partialIndex === "number" &&
    Number.isFinite(record.partialIndex) &&
    record.partialIndex >= 0 &&
    (record.progressStage === undefined ||
      record.progressStage === "queued" ||
      record.progressStage === "generating" ||
      record.progressStage === "finalizing") &&
    (record.progressMessage === undefined ||
      typeof record.progressMessage === "string") &&
    typeof record.updatedAt === "string" &&
    isValidDateString(record.updatedAt)
  );
}

function isGeneratedImageStatus(
  value: unknown
): value is PersistedChatGeneratedImage["status"] {
  return value === "running" || value === "complete" || value === "error";
}

function isSupportedImageMimeType(
  value: unknown
): value is PersistedChatImageAttachment["mimeType"] {
  return (
    value === "image/png" ||
    value === "image/jpeg" ||
    value === "image/webp"
  );
}

function isValidDateString(value: string) {
  return !Number.isNaN(new Date(value).getTime());
}
