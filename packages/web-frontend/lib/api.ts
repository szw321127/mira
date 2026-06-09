const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

export type ApiEnvelope<T> = {
  code: number;
  data: T;
  msg: string;
};

export type ApiRequestConfig = {
  body?: unknown;
  headers: Headers;
  method: string;
  path: string;
  token?: string | null;
};

export type ApiResponseContext<T> = {
  config: ApiRequestConfig;
  envelope: ApiEnvelope<T>;
  response: Response;
};

export type AuthUser = {
  account: string;
  id: string;
  loginAt: string;
  name: string;
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

export type BackendOutline = {
  batchId: string;
  createdAt: string;
  hook: string;
  id: string;
  label: string;
  points: string[];
  position: number;
  title: string;
  tone: string;
  updatedAt: string;
};

export type BackendOutlineBatch = {
  batchNo: number;
  conversationId: string;
  createdAt: string;
  id: string;
  outlines: BackendOutline[];
  prompt: string;
};

export type BackendPostDraft = {
  caption: string;
  conversationId: string;
  coverLine: string;
  createdAt: string;
  id: string;
  imageError: string | null;
  imageGeneratedAt: string | null;
  imageProvider: string | null;
  imagePrompt: string;
  imageStatus: "idle" | "generating" | "ready" | "failed";
  imageUrl: string | null;
  outlineId: string | null;
  sections: string[];
  stale: boolean;
  tags: string[];
  title: string;
  updatedAt: string;
};

export type BackendSavedDraft = {
  conversationId: string;
  createdAt: string;
  id: string;
  postDraftId: string | null;
  snapshot: Record<string, unknown>;
};

export type BackendSnapshot = {
  conversationId: string;
  createdAt: string;
  id: string;
  snapshot: Record<string, unknown>;
};

export type BackendConversation = {
  createdAt: string;
  currentPostDraft: BackendPostDraft | null;
  id: string;
  lastOpenedAt: string | null;
  outlineBatches: BackendOutlineBatch[];
  savedDrafts: BackendSavedDraft[];
  selectedOutlineId: string | null;
  snapshots: BackendSnapshot[];
  statusMessage: string | null;
  title: string;
  topic: string;
  updatedAt: string;
};

export type BackendConversationSummary = {
  createdAt: string;
  id: string;
  lastOpenedAt: string | null;
  outlineBatchCount: number;
  postDraftCount: number;
  savedDraftCount: number;
  selectedOutlineId: string | null;
  statusMessage: string | null;
  title: string;
  topic: string;
  updatedAt: string;
};

export type XhsOutlineStrategy = "pain-point" | "step-by-step" | "checklist";

export type XhsMetricValue = number | string | null | undefined;

export type XhsPostMetrics = {
  collects?: XhsMetricValue;
  comments?: XhsMetricValue;
  likes?: XhsMetricValue;
  shares?: XhsMetricValue;
};

export type XhsPostInput = {
  author?: string;
  content?: string;
  images?: string[];
  metrics?: XhsPostMetrics;
  publishTime?: string;
  tags?: string[];
  title: string;
  url?: string;
  videoUrl?: string;
};

export type XhsAccountInput = {
  bio?: string;
  followers?: XhsMetricValue;
  name: string;
  posts: XhsPostInput[];
  url?: string;
};

export type XhsPostAnalysis = {
  contentAngles: string[];
  engagement: {
    collects: number;
    comments: number;
    likes: number;
    shares: number;
    total: number;
  };
  format: "image-text" | "text" | "video";
  generationHints: string[];
  post: XhsPostInput;
  tagPatterns: string[];
  viralSignals: string[];
};

export type XhsAccountAnalysis = {
  contentPillars: Array<{ count: number; name: string }>;
  nextActions: string[];
  snapshot: {
    bio: string;
    followers: number;
    name: string;
    postCount: number;
    url?: string;
  };
  topPosts: XhsPostInput[];
};

export type XhsGenerationBrief = {
  idea: string;
  promptAdditions: string[];
  recommendedSections: string[];
  sourcePatterns: string[];
};

export type XhsImportedContentSource =
  | "browser"
  | "manual"
  | "provider"
  | "unknown";

export type XhsImportedPostRecord = {
  raw: Record<string, unknown>;
  source: XhsImportedContentSource;
  sourceId?: string;
};

export type XhsImportedAccountRecord = {
  raw: Record<string, unknown>;
  source: XhsImportedContentSource;
  sourceId?: string;
};

export type XhsImportDroppedRecord = {
  reason: "duplicate" | "missing-title";
  source: XhsImportedContentSource;
  sourceId?: string;
};

export type XhsImportSourceRecord = {
  normalizedId: string;
  rawId?: string;
  source: XhsImportedContentSource;
  sourceId?: string;
  url?: string;
};

export type XhsImportedPostsNormalization = {
  dropped: XhsImportDroppedRecord[];
  posts: XhsPostInput[];
  sources: XhsImportSourceRecord[];
};

export type XhsImportedAccountNormalization = {
  account: XhsAccountInput;
  dropped: XhsImportDroppedRecord[];
  source: XhsImportSourceRecord;
  sources: XhsImportSourceRecord[];
};

export type XhsProviderImportSummary = {
  complianceNote: string;
  endpoint: string;
  rateLimitPerMinute: number | null;
  sourceId: string;
  type: "custom" | "tikhub";
};

export type ImportedXhsPostAnalysis = {
  analysis: XhsPostAnalysis;
  imported: XhsImportedPostsNormalization;
  provider: XhsProviderImportSummary;
};

export type ImportedXhsAccountAnalysis = {
  analysis: XhsAccountAnalysis;
  imported: XhsImportedAccountNormalization;
  provider: XhsProviderImportSummary;
};

export type XhsOutlineCandidate = {
  audience: string;
  estimatedPageCount: number;
  id: string;
  idea: string;
  outline: string[];
  selectionReason: string;
  sourcePatterns: string[];
  strategy: XhsOutlineStrategy;
  title: string;
};

export type XhsPublishAuditIssue = {
  check: string;
  message: string;
  severity: "blocker" | "warning";
};

export type XhsImageTextPage = {
  body: string[];
  designNotes: string[];
  headline: string;
  imagePrompt: string;
  pageNumber: number;
  role: "content" | "cover" | "summary";
};

export type XhsImageTextPublishPackage = {
  caption: string;
  copyBlocks: {
    caption: string;
    hashtags: string;
    pageText: string;
    publishText: string;
    title: string;
  };
  hashtags: string[];
  idea: string;
  imagePromptPack: string[];
  pages: XhsImageTextPage[];
  platform: "xiaohongshu";
  publishingChecklist: string[];
  titleCandidates: string[];
};

export type XhsCommercialWorkflow = {
  accountAnalysis?: unknown;
  audit: {
    blockers: XhsPublishAuditIssue[];
    passedChecks: string[];
    ready: boolean;
    repairActions: string[];
    score: number;
    warnings: XhsPublishAuditIssue[];
  };
  brief: unknown;
  importedAccount?: unknown;
  importedPosts: unknown;
  publishPackage: XhsImageTextPublishPackage;
  referencePosts: unknown[];
  summary: {
    importedAccountPostCount: number;
    importedStandalonePostCount: number;
    ready: boolean;
    referenceCount: number;
    score: number;
    topContentPillars: string[];
  };
};

export type OutlineBatchResult = {
  batch: BackendOutlineBatch;
  conversation: BackendConversation;
};

export class ApiError extends Error {
  code: number;
  status: number;

  constructor(code: number, message: string, status = code) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type RequestOptions = {
  body?: unknown;
  method?: string;
  token?: string | null;
};

type Interceptor<T> = (value: T) => T | Promise<T>;
type ErrorInterceptor = (error: ApiError) => void | Promise<void>;

function createInterceptorManager<T>() {
  const interceptors = new Set<Interceptor<T>>();

  return {
    async run(value: T) {
      let nextValue = value;

      for (const interceptor of interceptors) {
        nextValue = await interceptor(nextValue);
      }

      return nextValue;
    },
    use(interceptor: Interceptor<T>) {
      interceptors.add(interceptor);
      return () => {
        interceptors.delete(interceptor);
      };
    },
  };
}

function createErrorInterceptorManager() {
  const interceptors = new Set<ErrorInterceptor>();

  return {
    async run(error: ApiError) {
      for (const interceptor of interceptors) {
        await interceptor(error);
      }
    },
    use(interceptor: ErrorInterceptor) {
      interceptors.add(interceptor);
      return () => {
        interceptors.delete(interceptor);
      };
    },
  };
}

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  if (typeof value !== "object" || value === null) return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "number" &&
    "data" in record &&
    typeof record.msg === "string"
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "请求失败，请稍后重试。";
}

export function getApiErrorMessage(error: unknown) {
  return getErrorMessage(error);
}

function normalizeApiError(error: unknown) {
  if (error instanceof ApiError) return error;
  return new ApiError(0, getErrorMessage(error), 0);
}

class ApiClient {
  interceptors = {
    error: createErrorInterceptorManager(),
    request: createInterceptorManager<ApiRequestConfig>(),
    response: createInterceptorManager<ApiResponseContext<unknown>>(),
  };

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers = new Headers();

    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    if (options.token) {
      headers.set("Authorization", `Bearer ${options.token}`);
    }

    const initialConfig: ApiRequestConfig = {
      body: options.body,
      headers,
      method: options.method ?? "GET",
      path,
      token: options.token,
    };

    try {
      const config = await this.interceptors.request.run(initialConfig);
      const response = await fetch(`${API_BASE_URL}${config.path}`, {
        body:
          config.body === undefined ? undefined : JSON.stringify(config.body),
        headers: config.headers,
        method: config.method,
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!isEnvelope(payload)) {
        throw new ApiError(
          response.status,
          "接口返回格式异常。",
          response.status,
        );
      }

      if (!response.ok || payload.code !== 0) {
        throw new ApiError(
          payload.code || response.status,
          payload.msg,
          response.status,
        );
      }

      const context = await this.interceptors.response.run({
        config,
        envelope: payload,
        response,
      });

      return context.envelope.data as T;
    } catch (error) {
      const apiError = normalizeApiError(error);
      await this.interceptors.error.run(apiError);
      throw apiError;
    }
  }
}

export const apiClient = new ApiClient();

const request = <T>(path: string, options?: RequestOptions) =>
  apiClient.request<T>(path, options);

export const api = {
  auth: {
    demo: () => request<AuthResponse>("/auth/demo", { method: "POST" }),
    google: (body: { credential: string }) =>
      request<AuthResponse>("/auth/google", { body, method: "POST" }),
    login: (body: { account: string; password: string }) =>
      request<AuthResponse>("/auth/login", { body, method: "POST" }),
    me: (token: string) => request<AuthUser>("/auth/me", { token }),
    register: (body: { account: string; name: string; password: string }) =>
      request<AuthResponse>("/auth/register", { body, method: "POST" }),
  },
  conversations: {
    create: (token: string, body: { title?: string; topic: string }) =>
      request<BackendConversation>("/conversations", {
        body,
        method: "POST",
        token,
      }),
    createOutlineBatch: (
      token: string,
      conversationId: string,
      body: { prompt?: string },
    ) =>
      request<OutlineBatchResult>(
        `/conversations/${conversationId}/outline-batches`,
        {
          body,
          method: "POST",
          token,
        },
      ),
    createSavedDraft: (
      token: string,
      conversationId: string,
      body: { postDraftId?: string; snapshot?: Record<string, unknown> },
    ) =>
      request<BackendSavedDraft>(
        `/conversations/${conversationId}/saved-drafts`,
        {
          body,
          method: "POST",
          token,
        },
      ),
    createSnapshot: (
      token: string,
      conversationId: string,
      body: { snapshot: Record<string, unknown> },
    ) =>
      request<BackendSnapshot>(`/conversations/${conversationId}/snapshots`, {
        body,
        method: "POST",
        token,
      }),
    delete: (token: string, conversationId: string) =>
      request<{ ok: boolean }>(`/conversations/${conversationId}`, {
        method: "DELETE",
        token,
      }),
    get: (token: string, conversationId: string) =>
      request<BackendConversation>(`/conversations/${conversationId}`, {
        token,
      }),
    list: (token: string) =>
      request<BackendConversationSummary[]>("/conversations", { token }),
    update: (
      token: string,
      conversationId: string,
      body: {
        selectedOutlineId?: string;
        statusMessage?: string;
        title?: string;
        topic?: string;
      },
    ) =>
      request<BackendConversation>(`/conversations/${conversationId}`, {
        body,
        method: "PATCH",
        token,
      }),
    generatePostDraft: (
      token: string,
      conversationId: string,
      body: { outlineId?: string },
    ) =>
      request<BackendPostDraft>(`/conversations/${conversationId}/post-draft`, {
        body,
        method: "POST",
        token,
      }),
  },
  outlines: {
    update: (
      token: string,
      outlineId: string,
      body: {
        hook?: string;
        label?: string;
        points?: string[];
        title?: string;
        tone?: string;
      },
    ) =>
      request<BackendOutline>(`/outlines/${outlineId}`, {
        body,
        method: "PATCH",
        token,
      }),
  },
  postDrafts: {
    get: (token: string, postDraftId: string) =>
      request<BackendPostDraft>(`/post-drafts/${postDraftId}`, { token }),
    generateImage: (
      token: string,
      postDraftId: string,
      body: { imagePrompt?: string },
    ) =>
      request<BackendPostDraft>(`/post-drafts/${postDraftId}/image`, {
        body,
        method: "POST",
        token,
      }),
    update: (
      token: string,
      postDraftId: string,
      body: {
        caption?: string;
        coverLine?: string;
        imagePrompt?: string;
        sections?: string[];
        tags?: string[];
        title?: string;
      },
    ) =>
      request<BackendPostDraft>(`/post-drafts/${postDraftId}`, {
        body,
        method: "PATCH",
        token,
      }),
  },
  xhs: {
    buildGenerationBrief: (
      token: string,
      body: {
        account?: XhsAccountAnalysis;
        idea: string;
        references: XhsPostAnalysis[];
      },
    ) =>
      request<XhsGenerationBrief>("/xhs-analysis/generation-brief", {
        body,
        method: "POST",
        token,
      }),
    buildCommercialDraft: (
      token: string,
      body: {
        account?: XhsImportedAccountRecord;
        audience?: string;
        idea: string;
        outline: string[];
        pageCount?: number;
        posts?: XhsImportedPostRecord[];
        tone?: string;
      },
    ) =>
      request<XhsCommercialWorkflow>(
        "/xhs-analysis/workflows/commercial-draft",
        {
          body,
          method: "POST",
          token,
        },
      ),
    buildOutlines: (
      token: string,
      body: { audience?: string; brief?: XhsGenerationBrief; idea: string },
    ) =>
      request<XhsOutlineCandidate[]>("/xhs-analysis/outlines", {
        body,
        method: "POST",
        token,
      }),
    importAccount: (
      token: string,
      body: {
        limit?: number;
        providerType?: XhsProviderImportSummary["type"];
        url?: string;
        userId?: string;
      },
    ) =>
      request<ImportedXhsAccountAnalysis>("/xhs-analysis/accounts/import", {
        body,
        method: "POST",
        token,
      }),
    importPost: (
      token: string,
      body: {
        noteId?: string;
        providerType?: XhsProviderImportSummary["type"];
        url?: string;
      },
    ) =>
      request<ImportedXhsPostAnalysis>("/xhs-analysis/posts/import", {
        body,
        method: "POST",
        token,
      }),
  },
  snapshots: {
    restore: (token: string, snapshotId: string) =>
      request<BackendSnapshot>(`/snapshots/${snapshotId}/restore`, {
        method: "POST",
        token,
      }),
  },
};
